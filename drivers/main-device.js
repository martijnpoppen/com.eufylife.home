const Homey = require('homey');
const { EUFY_CLEAN_GET_STATE, EUFY_CLEAN_VACUUMCLEANER_STATE, EUFY_CLEAN_LEGACY_CLEAN_SPEED, EUFY_CLEAN_WORK_STATUS, EUFY_CLEAN_ERROR_CODES, EUFY_CLEAN_GET_CLEAN_SPEED } = require('eufy-clean');
const { sleep } = require('../lib/helpers');

function isPrivateIp(value) {
    if (typeof value !== 'string') {
        return false;
    }

    const ip = value.trim();
    return /^10\./.test(ip)
        || /^192\.168\./.test(ip)
        || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
}

module.exports = class mainDevice extends Homey.Device {
    async onInit() {
        const driverManifest = this.driver.manifest;

        this.homey.app.log('[Device] - init =>', this.getName(), driverManifest.id);
        this.setUnavailable(`${this.getName()} is initializing.... This may take a while`);
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
            let { deviceId, deviceModel, apiType, localKey, ip, last_known_ip, protocol_version, map_id, find_timeout_seconds } = settings;
            const resolvedIp = isPrivateIp(last_known_ip) ? last_known_ip : (isPrivateIp(ip) ? ip : undefined);
            this.homey.app.log(`[Device] ${this.getName()} - initApi settings`, { ...settings, username: 'LOG', password: '***' });

            const deviceConfig = {
                deviceId,
                ...(deviceModel ? { deviceModel } : {}),
                ...(apiType ? { apiType } : {}),
                ...(localKey !== 'deprecated' && { localKey }),
                ...(localKey !== 'deprecated' && resolvedIp ? { ip: resolvedIp } : {}),
                ...(localKey !== 'deprecated' && { version: protocol_version || '3.3' }),
                ...(localKey !== 'deprecated' && { mapId: Number(map_id) || 1 }),
                ...(localKey !== 'deprecated' && { findTimeoutSeconds: Number(find_timeout_seconds) || 10 }),
                debug : false
            };

            this.eufyRoboVac = await this.homey.app.eufyClean.initDevice(deviceConfig);
            this.config = this.eufyRoboVac.config;

            await this.eufyRoboVac.connect();
            await this.persistResolvedIp();
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
        const settings = this.getSettings();
        const localKey = settings.localKey;
        const hasRealLocalKey = !!localKey && localKey !== 'deprecated';
        const resolvedApiType = this.config.apiType || settings.apiType;
        const supportsNamedScenes = !!this.config.mqtt;
        const supportsRoomClean = hasRealLocalKey && !this.config.mqtt
            && (
                resolvedApiType === 'novel'
                || (
                    !!this.eufyRoboVac?.supportsNumericRoomClean
                    && this.eufyRoboVac.supportsNumericRoomClean()
                )
            );

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

        if (supportsNamedScenes) {
            driverCapabilities = [...driverCapabilities, 'action_scene_named'];
        } else {
            deviceCapabilities = deviceCapabilities.filter((c) => c !== 'action_scene_named');
        }

        if (supportsRoomClean) {
            driverCapabilities = [...driverCapabilities, 'action_room_clean'];
        } else {
            deviceCapabilities = deviceCapabilities.filter((c) => c !== 'action_room_clean');
        }

        this.homey.app.log(`[Device] ${this.getName()} - Capability flags =>`, {
            mqtt: !!this.config.mqtt,
            apiType: this.config.apiType,
            resolvedApiType,
            hasRealLocalKey,
            supportsNamedScenes,
            supportsRoomClean
        });
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
            if(!this.eufyRoboVac) {
                return this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues => No device instance found, skipping capability update.`);
            }

            await this.eufyRoboVac.updateDevice();
            await this.persistResolvedIp();

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

    async persistResolvedIp() {
        const settings = this.getSettings();
        if (!settings.localKey || settings.localKey === 'deprecated' || !this.eufyRoboVac?.getResolvedIp) {
            return;
        }

        const resolvedIp = this.eufyRoboVac.getResolvedIp();
        if (!isPrivateIp(resolvedIp) || settings.last_known_ip === resolvedIp) {
            return;
        }

        await this.setSettings({
            last_known_ip: resolvedIp
        });
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
                    return await this.eufyRoboVac.sceneCleanSlot(1);
                case 'START_SCENE_CLEAN_2':
                    return await this.eufyRoboVac.sceneCleanSlot(2);
                case 'START_SCENE_CLEAN_3':
                    return await this.eufyRoboVac.sceneCleanSlot(3);
                case 'START_SCENE_CLEAN_4':
                    return await this.eufyRoboVac.sceneCleanSlot(4);
                case 'START_SCENE_CLEAN_5':
                    return await this.eufyRoboVac.sceneCleanSlot(5);
                case 'START_SCENE_CLEAN_6':
                    return await this.eufyRoboVac.sceneCleanSlot(6);
                case 'START_SCENE_CLEAN_7':
                    return await this.eufyRoboVac.sceneCleanSlot(7);
                case 'START_SCENE_CLEAN_8':
                    return await this.eufyRoboVac.sceneCleanSlot(8);
                case 'START_SCENE_CLEAN_9':
                    return await this.eufyRoboVac.sceneCleanSlot(9);
                case 'START_SCENE_CLEAN_10':
                    return await this.eufyRoboVac.sceneCleanSlot(10);
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

    async _onRoomCleanRequested(roomId, cleanTimes = 1) {
        this.homey.app.log(`[Device] ${this.getName()} - _onRoomCleanRequested =>`, { roomId, cleanTimes });
        try {
            const normalizedRoomId = Number.parseInt(String(roomId), 10);
            const normalizedCleanTimes = cleanTimes ? Number.parseInt(String(cleanTimes), 10) : 1;

            if (!Number.isFinite(normalizedRoomId) || normalizedRoomId < 1) {
                throw new Error('Please provide a valid room ID.');
            }

            return await this.eufyRoboVac.cleanRooms([normalizedRoomId], Number.isFinite(normalizedCleanTimes) && normalizedCleanTimes > 0 ? normalizedCleanTimes : 1);
        } catch (err) {
            this.homey.app.log(`[Device] ${this.getName()} - _onRoomCleanRequested => error`, err);
            this.log('_onRoomCleanRequested() -> error', err);
        }
    }

    async getSceneAutocompleteItems(query = '') {
        this.homey.app.log(`[Device] ${this.getName()} - getSceneAutocompleteItems =>`, query);
        try {
            const scenes = await this.eufyRoboVac.listScenes();
            const normalizedQuery = String(query || '').trim().toLowerCase();

            return scenes
                .filter((scene) => !normalizedQuery || scene.name.toLowerCase().includes(normalizedQuery))
                .map((scene) => ({
                    id: String(scene.id),
                    name: scene.name,
                    ...(scene.mapId ? { description: `Map ${scene.mapId}` } : {})
                }));
        } catch (err) {
            this.homey.app.log(`[Device] ${this.getName()} - getSceneAutocompleteItems => error`, err);
            this.log('getSceneAutocompleteItems() -> error', err);
            return [];
        }
    }

    async _onNamedSceneRequested(scene) {
        this.homey.app.log(`[Device] ${this.getName()} - _onNamedSceneRequested =>`, scene);
        try {
            const sceneId = Number.parseInt(String(scene?.id), 10);
            if (!Number.isFinite(sceneId) || sceneId < 1) {
                throw new Error('Please select a valid scene.');
            }

            return await this.eufyRoboVac.sceneClean(sceneId);
        } catch (err) {
            this.homey.app.log(`[Device] ${this.getName()} - _onNamedSceneRequested => error`, err);
            this.log('_onNamedSceneRequested() -> error', err);
        }
    }

    async registerListeners() {
        this.registerCapabilityListener('vacuumcleaner_state', this._onVacuumCapabilityChanged.bind(this));
        this.registerCapabilityListener('action_clean_speed', this._onCleanSpeedChanged.bind(this));
    }
};
