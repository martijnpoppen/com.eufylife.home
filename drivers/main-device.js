const Homey = require('homey');
const { RoboVac, WorkStatus, WorkMode } = require('../lib/eufy-robovac');
const { sleep } = require('../lib/helpers');
const { GET_STATE, SET_STATE } = require('../constants/state.constants');

module.exports = class mainDevice extends Homey.Device {
    async onInit() {
		this.homey.app.log('[Device] - init =>', this.getName());
        this.homey.app.setDevices(this);
        
        await this.initApi();
        await this.checkCapabilities();
        await this.setCapabilityValuesInterval();

        this.registerCapabilityListener('vacuumcleaner_state', this._onVacuumCapabilityChanged.bind(this));
        this.registerCapabilityListener('measure_work_mode', this._onWorkModeCapabilityChanged.bind(this));
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
                ip: settings.ipAddress
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
            const cleanState = await this.eufyRoboVac.getPlayPause();
            const currentState = GET_STATE[workStatus] || GET_STATE[workMode];
            
            await this.setCapabilityValue('measure_battery', parseInt(batteryLevel));
            await this.setCapabilityValue('measure_is_charging', workStatus === WorkStatus.CHARGING);
            await this.setCapabilityValue('measure_recharge_needed', workStatus === WorkStatus.RECHARGE_NEEDED);
            await this.setCapabilityValue('vacuumcleaner_state', currentState);
            await this.setCapabilityValue('measure_work_mode', workMode);

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
        if(Object.keys(SET_STATE).includes(value)) {
            await this.eufyRoboVac.startCleaning();
        }
    }

    async _onWorkModeCapabilityChanged(value) {
        this.homey.app.log(`[Device] ${this.getName()} - _onWorkModeCapabilityChanged =>`, value);
        if(Object.keys(SET_STATE).includes(value)) {
            await this.eufyRoboVac.setWorkStatus(SET_STATE[value]);
        }
    }
}