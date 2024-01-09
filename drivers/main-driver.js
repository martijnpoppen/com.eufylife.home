const Homey = require('homey');
const axios = require('axios');
const { RoboVac } = require('../lib/eufy-robovac');

module.exports = class mainDriver extends Homey.Driver {
    onInit() {
        this.homey.app.log('[Driver] - init', this.id);
        this.homey.app.log(`[Driver] - version`, Homey.manifest.version);
    }

    deviceType() {
        return 'other';
    }

    async onPair(session) {
        this.type = 'pair';
        this.setPairingSession(session);
    }

    async onRepair(session, device) {
        this.type = 'repair';
        this.setPairingSession(session, device);
    }

    async setPairingSession(session, device = null) {
        session.setHandler('showView', async (view) => {
            this.homey.app.log(`[Driver] ${this.id} - currentView:`, { view, type: this.type });

            if (view === 'loading') {
                if (device) {
                    const settings = device.getSettings();
                    const matchedDevice = this.devices.find((d) => d.settings.deviceId === settings.deviceId);

                    if (matchedDevice) {
                        await device.setSettings({
                            deviceId: matchedDevice.settings.deviceId,
                            localKey: matchedDevice.settings.localKey
                        });

                        await device.onRepair({
                            ...settings,
                            deviceId: matchedDevice.settings.deviceId,
                            localKey: matchedDevice.settings.localKey
                        });

                        session.showView('done');
                    } else {
                        this.homey.app.log('Device not found - ', matchedDevice);
                    }
                }
            }
        });

        session.setHandler('login', async (data) => {
            try {
                const response = await axios
                    .post(`${Homey.env.API_URL}/login`, {
                        username: data.username,
                        password: data.password
                    })
                    .catch(function (error) {
                        console.log(JSON.stringify(error));
                        throw new Error(error);
                    });

                console.log(response.data);

                if (typeof response.data === 'string') {
                    throw new Error(response.data);
                }

                this.devices = [];

                response.data.forEach((device) => {
                    this.devices.push({
                        name: `${device.name}`,
                        data: {
                            id: `${device.devId}-${device.localKey}`
                        },
                        settings: {
                            deviceId: device.devId,
                            localKey: device.localKey,
                            ip: '',
                            port: 6668
                        }
                    });
                });

                return true;
            } catch (error) {
                console.log(error);
                throw new Error(error);
            }
        });

        session.setHandler('list_devices', async () => {
            let results = this.devices;

            this.homey.app.log('Found devices - ', results);

            return results;
        });
    }
};
