const Homey = require('homey');
const { EUFY_CLEAN_DEVICES } = require('eufy-clean');
const { encrypt } = require('../lib/helpers');

module.exports = class mainDriver extends Homey.Driver {
    onInit() {
        this.homey.app.log('[Driver] - init', this.id);
        this.homey.app.log(`[Driver] - version`, Homey.manifest.version);

        this.homey.app.initDrivers();
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

            if (view === 'login_credentials' && !!this.homey.app.eufyClean && this.type === 'pair') {
                this.homey.app.log(`[Driver] ${this.id} - Found existing EufyClean instance, skipping login`);

                const deviceList = await this.homey.app.getAllDevices();

                if (deviceList.length) {
                    const device = deviceList[0];
                    const settings = device.getSettings();
                    const { username, password } = settings;

                    this.loginData = { username, password };

                    session.showView('loading');
                }
            }

            if (view === 'loading') {
                try {
                    if (!this.homey.app.eufyClean || this.type === 'repair') {
                        await this.homey.app.initEufyClean(this.loginData.username, this.loginData.password);

                        this.loginData = {
                            username: encrypt(this.loginData.username),
                            password: encrypt(this.loginData.password)
                        };
                    }

                    this.devices = await this.homey.app.eufyClean.getAllDevices();

                    session.showView('loading2');
                } catch (error) {
                    console.error(error);
                }
            }

            if (view === 'loading2') {
                try {
                    if (device) {
                        const settings = device.getSettings();
                        const matchedDevice = this.devices.find((d) => d.deviceId === settings.deviceId);

                        if (matchedDevice) {
                            const newSettings = {
                                apiType: matchedDevice.apiType,
                                deviceId: matchedDevice.deviceId,
                                deviceModel: matchedDevice.deviceModel,
                                deviceModelName: EUFY_CLEAN_DEVICES[matchedDevice.deviceModel] || matchedDevice.deviceModelName,
                                localKey: 'deprecated'
                            };

                            await device.setSettings(newSettings);

                            await this.homey.app.enableDevices(this.loginData);

                            this.loginData = null;

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
                this.loginData = {
                    username: data.username,
                    password: data.password
                };

                this.homey.app.disableDevices();

                return true;
            } catch (error) {
                console.log(error);
                throw new Error(error);
            }
        });

        session.setHandler('list_devices', async () => {
            const results = this.devices.map((device) => ({
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
                    ...this.loginData
                }
            }));

            this.devices = null;

            this.homey.app.log('Found devices - ', results);

            return results;
        });
    }

    async initFlowActions() {
        try {
            homey.flow.getActionCard('action_measure_clean_speed').registerRunListener(async (args, state) => {
                return await args.device._onCleanSpeedChanged(args.action_measure_clean_speed_type);
            });

            homey.flow.getActionCard('action_control_mode').registerRunListener(async (args, state) => {
                return await args.device._onControlModeChanged(args.action_control_mode_type);
            });

            homey.flow.getActionCard('action_scenes').registerRunListener(async (args, state) => {
                return await args.device._onControlModeChanged(args.action_scenes_type);
            });

            homey.flow.getActionCard('action_clean_params').registerRunListener(async (args, state) => {
                return await args.device._onCleanParamChanged({
                    cleanType: args.action_clean_params_cleantype,
                    cleanExtent: args.action_clean_params_cleanextent,
                    mopMode: args.action_clean_params_mopmode
                });
            });
        } catch (err) {
            this.homey.app.error(err);
        }
    }
};
