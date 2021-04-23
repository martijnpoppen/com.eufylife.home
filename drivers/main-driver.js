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
            this.config = {
                deviceId: data.deviceId,
                localKey: data.localKey,
                ip: data.ipAddress
            };

            this.homey.app.log(`[Driver] - got config`, this.config);

            this.eufyRoboVac = new RoboVac(this.config, false)
            await this.eufyRoboVac.getStatuses();
            return await this.eufyRoboVac.formatStatus();
        });

        session.setHandler("list_devices", async () => {
            let results = [];

            let pairedDriverDevices = [];

            this.homey.app.getDevices().forEach((device) => {
                const data = device.getData();
                pairedDriverDevices.push(data.deviceId);
            });

            this.homey.app.log(`[Driver] ${this.id} - pairedDriverDevices`, pairedDriverDevices);
            if(!pairedDriverDevices.includes(this.config.deviceId)) {
                results.push({
                    name: `Eufy Robovac - ${this.id}`,
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
