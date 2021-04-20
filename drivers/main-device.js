const Homey = require('homey');
const { RoboVac } = require('eufy-robovac');
const { sleep } = require('../lib/helpers');

module.exports = class mainDevice extends Homey.Device {
    async onInit() {
		this.homey.app.log('[Device] - init =>', this.getName());
        this.homey.app.setDevices(this);
        
        await this.initApi();
        await this.checkCapabilities();
        await this.setCapabilityValues();
        await this.setCapabilityValuesInterval();
       
    }

    onDeleted() {
        if( this.onPollInterval ) {
          clearInterval(this.onPollInterval);
        }
    }

    async initApi() {
        try {  
            const {deviceId, localKey } = this.getSettings();
            this.eufyRoboVac = await new RoboVac({deviceId, localKey}, true);
            await this.eufyRoboVac.getStatuses();
        } catch (error) {
            this.setUnavailable(error)
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
            const batteryLevel = await this.eufyRoboVac.getBatteyLevel();

            this.homey.app.log(`[Device] ${this.getName()} - batteryLevel =>`, batteryLevel);
            
            await this.setCapabilityValue('measure_battery', parseInt(batteryLevel));

            await this.setAvailable();
        } catch (error) {
            this.setUnavailable(error)
            this.homey.app.log(error);
        }
    }

    async setCapabilityValuesInterval() {
        try {  
            await sleep(2000);
            const REFRESH_INTERVAL = 1000 * (1 * 60);

            this.homey.app.log(`[Device] ${this.getName()} - onPollInterval =>`, REFRESH_INTERVAL);
            this.onPollInterval = setInterval(this.setCapabilityValues.bind(this), REFRESH_INTERVAL);
        } catch (error) {
            this.setUnavailable(error)
            this.homey.app.log(error);
        }
    }
}