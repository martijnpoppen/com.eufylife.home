const Homey = require('homey');
const { EufyCleanLogin, EUFY_CLEAN_DEVICES } = require('../lib/eufy-clean');
const { encrypt } = require('../lib/helpers');

module.exports = class mainDriver extends Homey.Driver {
    onInit() {
        this.homey.app.log('[Driver] - init', this.id);
        this.homey.app.log(`[Driver] - version`, Homey.manifest.version);

        this.homey.app.setDevices(this.getDevices());
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
                try {
                    const response = await this.eufyLogin.login();
                    this.cloudDevices = response.cloudDevices;
                    this.mqttDevices = response.mqttDevices;

                    session.showView('loading2');
                } catch (error) {
                    console.error(error);
                }
            }

            if (view === 'loading2') {
                try {
                    if (device) {
                        const settings = device.getSettings();
                        const matchedDevice = this.devices.find((d) => d.settings.deviceId === settings.deviceId);

                        if (matchedDevice) {
                            const newSettings = {
                                deviceId: matchedDevice.settings.deviceId,
                                localKey: 'deprecated',
                                apiType: matchedDevice.settings.apiType,
                                ...this.loginData
                            };

                            await device.setSettings(newSettings);
                            await device.onRepair({
                                ...settings,
                                ...newSettings
                            });

                            session.showView('done');
                        } else {
                            this.homey.app.log('Device not found - ', matchedDevice);
                        }
                    } else {
                        session.showView('list_devices');
                    }
                } catch (error) {
                    console.error(error);
                }
            }
        });

        session.setHandler('login', async (data) => {
            try {
                this.eufyLogin = new EufyCleanLogin(data.username, data.password);

                this.loginData = {
                    username: encrypt(data.username),
                    password: encrypt(data.password)
                };

                return true;
            } catch (error) {
                console.log(error);
                throw new Error(error);
            }
        });

        session.setHandler('list_devices', async () => {
            const results = [...this.cloudDevices, ...this.mqttDevices].map((device) => ({
                name: `${device.deviceName}`,
                data: {
                    id: `${device.deviceId}`
                },
                settings: {
                    apiType: device.apiType,
                    deviceId: device.deviceId,
                    deviceModel: device.deviceModel,
                    deviceModelName: EUFY_CLEAN_DEVICES[device.deviceModel] || device.deviceModelName,
                    localKey: 'deprecated',
                    mqtt: device.mqtt,
                    ...this.loginData
                }
            }));

            this.homey.app.log('Found devices - ', results);

            return results;
        });
    }
};
