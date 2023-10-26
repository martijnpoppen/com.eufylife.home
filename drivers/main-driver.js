const Homey = require("homey");
const { RoboVac } = require('../lib/eufy-robovac');

module.exports = class mainDriver extends Homey.Driver {
    onInit() {
        this.homey.app.log("[Driver] - init", this.id);
        this.homey.app.log(`[Driver] - version`, Homey.manifest.version);
    }

    deviceType() {
        return "other";
    }

    async onPair(session) {
        session.setHandler("login", async (data) => {
            try {
                this.config = {
                    deviceId: data.deviceId,
                    localKey: `${data.localKey}`,
                    ip: data.ipAddress,
                    port: 6668
                };
    
                this.homey.app.log(`[Driver] - ${this.id} - Login with config`, this.config);
    
                this.eufyRoboVac = new RoboVac(this.config, false)
                this.homey.app.log(`[Driver] - ${this.id} - Login succes: `, this.eufyRoboVac);
    
                this.statuses = await this.eufyRoboVac.getStatuses();
                this.homey.app.log(`[Driver] - ${this.id} - Statuses`, this.statuses);
    
                await this.eufyRoboVac.formatStatus();

                return true
            } catch (error) {
                this.homey.app.log(error);
                return Promise.reject(new Error('Something went wrong. Make sure to set a static IP address and check you deviceID and LocalKey'));
            }
        });

        session.setHandler("list_devices", async () => {
            const deviceType = this.deviceType();
            let results = [];
            let pairedDriverDevices = [];

            this.homey.app.getDevices().forEach((device) => {
                const data = device.getData();
                pairedDriverDevices.push(data.deviceId);
            });

            this.homey.app.log(`[Driver] - ${this.id} - pairedDriverDevices`, pairedDriverDevices);
            if(!pairedDriverDevices.includes(this.config.deviceId)) {
                results.push({
                    name: `Eufy Robovac - ${deviceType}`,
                    data: {
                        id: `${this.config.deviceId}-${this.config.localKey}`,
                    },
                    settings: {
                        ...this.config
                    }
                });
            }

            await this.eufyRoboVac.disconnect();

            this.homey.app.log("Found devices - ", results);

            return results;
        });
    }
};
