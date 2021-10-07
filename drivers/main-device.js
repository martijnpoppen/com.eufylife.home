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
        this.homey.app.log(`[Device] ${this.getName()} - oldSettings`, oldSettings);
        this.homey.app.log(`[Device] ${this.getName()} - newSettings`, newSettings);
        this.eufyRoboVac.disconnect();

        if( this.onPollInterval ) {
            clearInterval(this.onPollInterval);
        }

        await this.initApi(newSettings);
        await this.checkCapabilities();
        await this.setCapabilityValuesInterval();
      }

    onDeleted() {
        if( this.onPollInterval ) {
          clearInterval(this.onPollInterval);
        }
    }

    async initApi(overrideSettings = null) {
        try {
            let {deviceId, localKey, ip, port, debug_log} = overrideSettings ? overrideSettings : this.getSettings();  
            this.homey.app.log(`[Device] ${this.getName()} - getSettings`, this.getSettings(), overrideSettings);

            this.config = { deviceId, localKey, ip, port };

            this.homey.app.log(`[Device] ${this.getName()} - initApi`);

            this.eufyRoboVac = new RoboVac(this.config, debug_log)
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
            const cleanSpeed = await this.eufyRoboVac.getCleanSpeed();
            const errors = await this.eufyRoboVac.getErrorCode();
            const cleanState = await this.eufyRoboVac.getPlayPause();
            const currentState = GET_STATE[workStatus] || GET_STATE[workMode];

            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - workStatus`, workStatus);
            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - workMode`, workMode);
            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - currentState`, currentState);
            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - cleanSpeed`, cleanSpeed);
            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - errors`, errors);

            await this.setCapabilityValue('measure_battery', parseInt(batteryLevel));
            await this.setCapabilityValue('alarm_battery', parseInt(batteryLevel) < 15);

            if(workStatus) {
                await this.setCapabilityValue('measure_is_charging', workStatus === WorkStatus.CHARGING);
                await this.setCapabilityValue('measure_recharge_needed', workStatus === WorkStatus.RECHARGE_NEEDED);
                await this.setCapabilityValue('measure_work_status', workStatus);
            }

            if(currentState) {
                await this.setCapabilityValue('measure_docked', currentState === 'docked' || currentState === 'stopped');
                await this.setCapabilityValue('vacuumcleaner_state', currentState);
            }

            if(workMode) {
                await this.setCapabilityValue('measure_work_mode', workMode);
            }

            if(cleanSpeed && this.hasCapability('measure_clean_speed')) {
                await this.setCapabilityValue('measure_clean_speed', `${cleanSpeed}`);
            }
            
            await this.setCapabilityValue('measure_error', !errors ? 'no_error' : errors);
        
            this.homey.app.log(`[Device] ${this.getName()} - cleanState`, cleanState);

            await this.setAvailable();
        } catch (error) {
            this.setUnavailable(error);
            this.homey.app.log(error);
        }
    }

    async setCapabilityValuesInterval() {
        try {  
            const REFRESH_INTERVAL = 1000 * (1 * 60);

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
                return await this.eufyRoboVac.startCleaning();
              case VACUUMCLEANER_STATE.SPOT_CLEANING:
                  await this.eufyRoboVac.play();
                return await this.eufyRoboVac.setWorkMode(WorkMode.SMALL_ROOM)
              case VACUUMCLEANER_STATE.DOCKED:
                return await this.eufyRoboVac.goHome();
              case VACUUMCLEANER_STATE.CHARGING:
                return await this.eufyRoboVac.goHome();
              case VACUUMCLEANER_STATE.STOPPED:
                return await this.eufyRoboVac.pause();
              default:
                this.homey.app.log(`[Device] ${this.getName()} - _onVacuumCapabilityChanged => received unknown value:`, value);
            }
          } catch (err) {
            this.homey.app.log(`[Device] ${this.getName()} - _onVacuumCapabilityChanged => error`, err);
            this.log('_onVacuumCapabilityChanged() -> error', err);
        }
    }
}