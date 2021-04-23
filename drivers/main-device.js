const Homey = require('homey');
const { RoboVac, WorkStatus, WorkMode } = require('../lib/eufy-robovac');
const { sleep } = require('../lib/helpers');
const { GET_STATE, SET_STATE, VACUUMCLEANER_STATE } = require('../constants/state.constants');

module.exports = class mainDevice extends Homey.Device {
    async onInit() {
		this.homey.app.log('[Device] - init =>', this.getName());
        this.homey.app.setDevices(this);
        
        await this.initApi();
        await this.checkCapabilities();
        await this.setCapabilityValuesInterval();

        this.registerCapabilityListener('vacuumcleaner_state', this._onVacuumCapabilityChanged.bind(this));
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        if( this.onPollInterval ) {
            clearInterval(this.onPollInterval);
        }

        await this.initApi();
        await this.checkCapabilities();
        await this.setCapabilityValuesInterval();
      }

    onDeleted() {
        if( this.onPollInterval ) {
          clearInterval(this.onPollInterval);
        }
    }

    async initApi() {
        try {
            const settings = this.getSettings();  
            this.homey.app.log("settings", settings)
            this.config = {
                deviceId: settings.deviceId,
                localKey: settings.localKey,
                ip: settings.ip,
                port: settings.port
            };

            this.homey.app.log(`[Device] ${this.getName()} - initApi`);

            this.eufyRoboVac = new RoboVac(this.config, true)
            await this.eufyRoboVac.getStatuses();
            await this.eufyRoboVac.formatStatus()
        } catch (error) {
            this.setUnavailable(error);
            this.homey.app.log(error);
        }
    }

    async checkCapabilities() {
        const driverManifest = this.driver.manifest;
        const driverCapabilities = driverManifest.capabilities;
        
        const deviceCapabilities = this.getCapabilities();

        this.homey.app.log(`[Device] ${this.getName()} - Found capabilities =>`, deviceCapabilities);
        
        if(driverCapabilities.length > deviceCapabilities.length) {      
            await this.updateCapabilities(driverCapabilities);
        }

        return deviceCapabilities;
    }

    async updateCapabilities(driverCapabilities) {
        this.homey.app.log(`[Device] ${this.getName()} - Add new capabilities =>`, driverCapabilities);
        try {
            driverCapabilities.forEach(c => {
                this.addCapability(c);
            });
            await sleep(2000);
        } catch (error) {
            this.homey.app.log(error)
        }
    }

    async setCapabilityValues() {
        this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues`);

        try {    
            const batteryLevel = await this.eufyRoboVac.getBatteyLevel() || 1;
            const workStatus = await this.eufyRoboVac.getWorkStatus();
            const workMode = await this.eufyRoboVac.getWorkMode();
            const errors = await this.eufyRoboVac.getErrorCode();
            const cleanState = await this.eufyRoboVac.getPlayPause();
            const currentState = GET_STATE[workStatus] || GET_STATE[workMode];

            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - workStatus`, workStatus);
            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - workMode`, workMode);
            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - currentState`, currentState);
            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - errors`, errors);

            await this.setCapabilityValue('measure_battery', parseInt(batteryLevel));
            await this.setCapabilityValue('measure_is_charging', workStatus === WorkStatus.CHARGING);
            await this.setCapabilityValue('measure_recharge_needed', workStatus === WorkStatus.RECHARGE_NEEDED);
            await this.setCapabilityValue('measure_docked', currentState === 'docked');
            await this.setCapabilityValue('measure_error', errors === 0 ? 'no_error' : errors);
            await this.setCapabilityValue('vacuumcleaner_state', currentState);
            await this.setCapabilityValue('measure_work_mode', workMode);
            await this.setCapabilityValue('measure_work_status', workStatus);

            this.homey.app.log(`[Device] ${this.getName()} - cleanState`, cleanState);

            await this.setAvailable();
        } catch (error) {
            this.setUnavailable(error);
            this.homey.app.log(error);
        }
    }

    async setCapabilityValuesInterval() {
        try {  
            const REFRESH_INTERVAL = 1000 * (3 * 60);

            this.homey.app.log(`[Device] ${this.getName()} - onPollInterval =>`, REFRESH_INTERVAL);
            this.onPollInterval = setInterval(this.setCapabilityValues.bind(this), REFRESH_INTERVAL);

            await this.setCapabilityValues();
        } catch (error) {
            this.setUnavailable(error)
            this.homey.app.log(error);
        }
    }

    async _onVacuumCapabilityChanged(value) {
        this.homey.app.log(`[Device] ${this.getName()} - _onVacuumCapabilityChanged =>`, value);
        try {
            switch (value) {
              case VACUUMCLEANER_STATE.CLEANING:
                return this.eufyRoboVac.startCleaning();
              case VACUUMCLEANER_STATE.SPOT_CLEANING:
                return this.eufyRoboVac.setWorkMode(WorkMode.SPOT)
              case VACUUMCLEANER_STATE.DOCKED:
                return this.eufyRoboVac.goHome();
              case VACUUMCLEANER_STATE.CHARGING:
                return this.eufyRoboVac.goHome();
              case VACUUMCLEANER_STATE.STOPPED:
                return this.eufyRoboVac.pause();
              default:
                this.homey.app.log(`[Device] ${this.getName()} - _onVacuumCapabilityChanged => received unknown value:`, value);
            }
          } catch (err) {
            this.homey.app.log(`[Device] ${this.getName()} - _onVacuumCapabilityChanged => error`, err);
            this.log('_onVacuumCapabilityChanged() -> error', err);
            return Promise.reject(new Error(Homey.__('error.failed_state_change')));
        }
    }
}