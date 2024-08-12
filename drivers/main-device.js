const Homey = require('homey');
const {
    EUFY_CLEAN_GET_STATE,
    EUFY_CLEAN_VACUUMCLEANER_STATE,
    EUFY_CLEAN_LEGACY_CLEAN_SPEED,
    EUFY_CLEAN_WORK_STATUS,
    EUFY_CLEAN_ERROR_CODES,
    EUFY_CLEAN_GET_CLEAN_SPEED
} = require('../lib/eufy-clean');
const { sleep } = require('../lib/helpers');

module.exports = class mainDevice extends Homey.Device {
    async onInit() {
        const settings = this.getSettings();
        const driverManifest = this.driver.manifest;

        this.homey.app.log('[Device] - init =>', this.getName(), driverManifest.id);
        this.setUnavailable(`${this.getName()} is initializing.... This may take a while`);

        if ('localKey' in settings && settings.localKey !== 'deprecated') {
            // this.setUnavailable('Legacy API detected. Please repair the device to use the new API.');

            await this.homey.notifications.createNotification({
                excerpt: `[Eufy Clean][${this.getName()}] \n\n Old API detected! - Please repair the device to use the new API. The app was rewritten because of a lot of changes in the API. You can still use this app as you were used to, however support for local devices will be removed in the future \n\n\n - Please repair the device to use the new API.`,
            });
        }
    }

    onAdded() {
        this.onStartup(1);
    }

    async onStartup(index) {
        const sleepTime = (index + 1) * 1000;
        this.homey.app.log('[Device] - sleep =>', this.getName(), sleepTime);
        await sleep(sleepTime);
        
        await this.enableDevice(true);
    }

    async enableDevice(checkCapabilities = false, overrideSettings = null) {
        await this.initApi(overrideSettings);

        if (checkCapabilities) {
            await this.checkCapabilities();
        }

        await this.setCapabilityValuesInterval();
        await this.setAvailable();
    }

    async disableDevice() {
        if (this.onPollInterval) {
            clearInterval(this.onPollInterval);
        }

        this.eufyRoboVac = null;

        this.setUnavailable('Repair mode active');
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.homey.app.log(`[Device] ${this.getName()} - newSettings`, newSettings);

        if (this.onPollInterval) {
            clearInterval(this.onPollInterval);
        }

        this.enableDevice(false, newSettings);
    }

    onDeleted() {
        if (this.onPollInterval) {
            clearInterval(this.onPollInterval);
        }

        const deviceObject = this.getData();
        this.homey.app.removeDevice(deviceObject.id);
    }

    async initApi(overrideSettings = null) {
        try {
            const settings = overrideSettings ? overrideSettings : this.getSettings();
            let { deviceId, localKey, ip } = settings;
            this.homey.app.log(`[Device] ${this.getName()} - initApi settings`, { ...settings, username: 'LOG', password: '***' });

            const deviceConfig = {
                deviceId,
                ...(localKey !== 'deprecated' && { localKey }),
                ...(localKey !== 'deprecated' && { ip }),
                debug : false
            };

            this.eufyRoboVac = await this.homey.app.eufyClean.initDevice(deviceConfig);
            this.config = this.eufyRoboVac.config;

            await this.eufyRoboVac.connect();
            await this.eufyRoboVac.formatStatus();
        } catch (error) {
            this.setUnavailable(error);
            this.homey.app.log(error);
        }
    }

    async checkCapabilities() {
        const driverManifest = this.driver.manifest;
        let driverCapabilities = driverManifest.capabilities;
        let deviceCapabilities = this.getCapabilities();

        if (this.config.apiType === 'novel') {
            driverCapabilities = [...driverCapabilities, 'action_clean_params'];

            if(this.config.mqtt) {
                driverCapabilities = [...driverCapabilities, 'action_scenes'];
            } else {
                deviceCapabilities = deviceCapabilities.filter((c) => c !== 'action_scenes');
            }
        } else {
            deviceCapabilities = deviceCapabilities.filter((c) => c !== 'action_clean_params');
            deviceCapabilities = deviceCapabilities.filter((c) => c !== 'action_scenes');
        }

        this.homey.app.log(`[Device] ${this.getName()} - Found capabilities =>`, deviceCapabilities);

        await this.updateCapabilities(driverCapabilities, deviceCapabilities);

        return await this.registerListeners();
    }

    async updateCapabilities(driverCapabilities, deviceCapabilities) {
        try {
            const newC = driverCapabilities.filter((d) => !deviceCapabilities.includes(d));
            const oldC = deviceCapabilities.filter((d) => !driverCapabilities.includes(d));

            this.homey.app.debug(`[Device] ${this.getName()} - Got old capabilities =>`, oldC);
            this.homey.app.debug(`[Device] ${this.getName()} - Got new capabilities =>`, newC);

            oldC.forEach((c) => {
                this.homey.app.log(`[Device] ${this.getName()} - updateCapabilities => Remove `, c);
                this.removeCapability(c).catch((e) => this.homey.app.debug(e));
            });
            await sleep(500);
            newC.forEach((c) => {
                this.homey.app.log(`[Device] ${this.getName()} - updateCapabilities => Add `, c);
                this.addCapability(c).catch((e) => this.homey.app.debug(e));
            });
            await sleep(500);
        } catch (error) {
            this.homey.app.error(error);
        }
    }

    async setCapabilityValues() {
        this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues`);

        this.unsetWarning()

        try {
            await this.eufyRoboVac.updateDevice();

            const batteryLevel = (await this.eufyRoboVac.getBatteryLevel()) || 1;
            const workStatus = await this.eufyRoboVac.getWorkStatus();
            const workMode = await this.eufyRoboVac.getWorkMode();
            const cleanSpeed = await this.eufyRoboVac.getCleanSpeed();
            const errorCode = await this.eufyRoboVac.getErrorCode();
            const currentState = EUFY_CLEAN_GET_STATE[workStatus] || EUFY_CLEAN_GET_STATE[workMode];

            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - workStatus`, workStatus);
            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - workMode`, workMode);
            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - currentState`, currentState);
            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - cleanSpeed`, cleanSpeed);
            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - errorCode`, errorCode);
            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - batteryLevel`, batteryLevel);

            await this.setCapabilityValue('measure_battery', parseInt(batteryLevel));
            await this.setCapabilityValue('alarm_battery', parseInt(batteryLevel) < 15);

            if (workStatus) {
                await this.setCapabilityValue('measure_is_charging', workStatus === 'charging');
                await this.setCapabilityValue('measure_recharge_needed', workStatus === 'recharge' || workStatus === 'charging');
                await this.setCapabilityValue('measure_work_status', EUFY_CLEAN_WORK_STATUS[workStatus.toUpperCase()] || workStatus);
            }

            if (currentState) {
                await this.setCapabilityValue('measure_docked', currentState === 'docked' || currentState === 'stopped' || currentState === 'charging' || currentState === 'standby');
                await this.setCapabilityValue('vacuumcleaner_state', currentState);
            }

            if (workMode) {
                await this.setCapabilityValue('measure_work_mode', workMode);
            }

            if (EUFY_CLEAN_LEGACY_CLEAN_SPEED.some((l) => l.toLowerCase() === cleanSpeed)) {
                await this.removeCapability('action_clean_speed');
                this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - cleanSpeed - removing action_clean_speed`);
            } else if (this.hasCapability('action_clean_speed') && cleanSpeed) {
                await this.setCapabilityValue('action_clean_speed', `${cleanSpeed}`);
            }

            if (cleanSpeed) {
                await this.setCapabilityValue('measure_clean_speed', `${EUFY_CLEAN_GET_CLEAN_SPEED[cleanSpeed]}`);
            }

            if (typeof errorCode === 'number') {
                await this.setCapabilityValue('measure_error', EUFY_CLEAN_ERROR_CODES[errorCode] || 'unknown_error');
            } else {
                await this.setCapabilityValue('measure_error', !errorCode ? 'no_error' : errorCode);
            }

            await this.setAvailable();
        } catch (error) {
            this.setUnavailable(error);
            this.homey.app.log(error);
        }
    }

    async setCapabilityValuesInterval() {
        try {
            const REFRESH_INTERVAL = 10000;

            this.homey.app.log(`[Device] ${this.getName()} - onPollInterval =>`, REFRESH_INTERVAL);
            this.onPollInterval = this.homey.setInterval(this.setCapabilityValues.bind(this), REFRESH_INTERVAL);

            await this.setCapabilityValues();
        } catch (error) {
            this.setUnavailable(error);
            this.homey.app.log(error);
        }
    }

    async _onVacuumCapabilityChanged(value) {
        this.homey.app.log(`[Device] ${this.getName()} - _onVacuumCapabilityChanged =>`, value);
        try {
            switch (value) {
                case EUFY_CLEAN_VACUUMCLEANER_STATE.CLEANING:
                    return await this.eufyRoboVac.autoClean();
                case EUFY_CLEAN_VACUUMCLEANER_STATE.SPOT_CLEANING:
                    return await this.eufyRoboVac.roomClean();
                case EUFY_CLEAN_VACUUMCLEANER_STATE.DOCKED:
                    return await this.eufyRoboVac.goHome();
                case EUFY_CLEAN_VACUUMCLEANER_STATE.CHARGING:
                    return await this.eufyRoboVac.goHome();
                case EUFY_CLEAN_VACUUMCLEANER_STATE.STOPPED:
                    return await this.eufyRoboVac.stop();
                default:
                    this.homey.app.log(`[Device] ${this.getName()} - _onVacuumCapabilityChanged => received unknown value:`, value);
            }
        } catch (err) {
            this.homey.app.log(`[Device] ${this.getName()} - _onVacuumCapabilityChanged => error`, err);
            this.log('_onVacuumCapabilityChanged() -> error', err);
        }
    }

    async _onControlModeChanged(value) {
        this.homey.app.log(`[Device] ${this.getName()} - _onControlModeChanged =>`, value);
        try {
            switch (value) {
                case 'AUTO_CLEAN':
                    return await this.eufyRoboVac.autoClean();
                case 'ROOM_CLEAN':
                    return await this.eufyRoboVac.roomClean();
                case 'SPOT_CLEAN':
                    return await this.eufyRoboVac.spotClean();
                case 'GO_HOME':
                    return await this.eufyRoboVac.goHome();
                case 'PAUSE':
                    return await this.eufyRoboVac.pause();
                case 'STOP':
                    return await this.eufyRoboVac.stop();
                case 'PLAY':
                    return await this.eufyRoboVac.play();
                case 'START_SCENE_CLEAN_1':
                    return await this.eufyRoboVac.sceneClean(1);
                case 'START_SCENE_CLEAN_2':
                    return await this.eufyRoboVac.sceneClean(2);
                case 'START_SCENE_CLEAN_3':
                    return await this.eufyRoboVac.sceneClean(3);
                case 'START_SCENE_CLEAN_4':
                    return await this.eufyRoboVac.sceneClean(4);
                case 'START_SCENE_CLEAN_5':
                    return await this.eufyRoboVac.sceneClean(5);
                case 'START_SCENE_CLEAN_6':
                    return await this.eufyRoboVac.sceneClean(6);
                case 'START_SCENE_CLEAN_7':
                    return await this.eufyRoboVac.sceneClean(7);
                case 'START_SCENE_CLEAN_8':
                    return await this.eufyRoboVac.sceneClean(8);
                case 'START_SCENE_CLEAN_9':
                    return await this.eufyRoboVac.sceneClean(9);
                case 'START_SCENE_CLEAN_10':
                    return await this.eufyRoboVac.sceneClean(10);
                default:
                    this.homey.app.log(`[Device] ${this.getName()} - _onControlModeChanged => received unknown value:`, value);
            }
        } catch (err) {
            this.homey.app.log(`[Device] ${this.getName()} - _onControlModeChanged => error`, err);
            this.log('_onControlModeChanged() -> error', err);
        }
    }

    async _onCleanSpeedChanged(value) {
        this.homey.app.log(`[Device] ${this.getName()} - _onCleanSpeedChanged =>`, value);
        try {
            return await this.eufyRoboVac.setCleanSpeed(value);
        } catch (err) {
            this.homey.app.log(`[Device] ${this.getName()} - _onCleanSpeedChanged => error`, err);
            this.log('_onCleanSpeedChanged() -> error', err);
        }
    }

    async _onCleanParamChanged(value) {
        this.homey.app.log(`[Device] ${this.getName()} - _onCleanParamChanged =>`, value);
        try {
            return await this.eufyRoboVac.setCleanParam(value);
        } catch (err) {
            this.homey.app.log(`[Device] ${this.getName()} - _onCleanParamChanged => error`, err);
            this.log('_onCleanParamChanged() -> error', err);
        }
    }

    async registerListeners() {
        this.registerCapabilityListener('vacuumcleaner_state', this._onVacuumCapabilityChanged.bind(this));
        this.registerCapabilityListener('action_clean_speed', this._onCleanSpeedChanged.bind(this));
    }
};
