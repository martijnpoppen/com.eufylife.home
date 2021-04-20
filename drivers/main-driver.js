const Homey = require("homey");
const { RoboVac } = require('eufy-robovac');

module.exports = class mainDriver extends Homey.Driver {
    onInit() {
        this.homey.app.log("[Driver] - init", this.id);
        this.homey.app.log(`[Driver] - version`, Homey.manifest.version);
    }

    deviceType() {
        return "other";
    }

    async onPair(session) {
        let username = "";
        let password = "";

        session.setHandler("login", async (data) => {
            const config = {
                deviceId: data.username,
                localKey: data.password,
                debugLog: true
            };

            // this.EufyRoboVac = await new RoboVac(config)

            // return await this.EufyRoboVac.getStatuses();
            return true;
        });

        session.setHandler("list_devices", async () => {
            let results = [];

            let pairedDriverDevices = [];

            this.homey.app.getDevices().forEach((device) => {
                const data = device.getData();
                pairedDriverDevices.push(data.deviceId);
            });

            this.homey.app.log(`[Driver] ${driverId} - pairedDriverDevices`, pairedDriverDevices);
            if(!pairedDriverDevices.includes(deviceId)) {
                results.push({
                    name: d.type,
                    data: {
                        name: d.type,
                        index: i,
                        id: `${config.deviceId}-${config.localKey}`,
                    },
                    settings: {
                        ...config
                    }
                });
            }

            this.homey.app.log("Found devices - ", results);

            return results;
        });
    }
};
