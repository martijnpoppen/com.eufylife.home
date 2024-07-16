// ---------------------------------------INIT FUNCTION----------------------------------------------------------

exports.init = async function (homey) {
    try {
        homey.app.action_measure_clean_speed = homey.flow.getActionCard('action_measure_clean_speed');
        homey.app.action_measure_clean_speed.registerRunListener(async (args, state) => {
            return await args.device._onCleanSpeedChanged(args.action_measure_clean_speed_type);
        });

        homey.app.action_control_mode = homey.flow.getActionCard('action_control_mode');
        homey.app.action_control_mode.registerRunListener(async (args, state) => {
            return await args.device._onControlModeChanged(args.action_control_mode_type);
        });

        homey.app.action_scenes = homey.flow.getActionCard('action_scenes');
        homey.app.action_scenes.registerRunListener(async (args, state) => {
            return await args.device._onControlModeChanged(args.action_scenes_type);
        });

        homey.app.action_clean_params = homey.flow.getActionCard('action_clean_params');
        homey.app.action_clean_params.registerRunListener(async (args, state) => {
            return await args.device._onCleanParamChanged({
                cleanType: args.action_clean_params_cleantype,
                cleanExtent: args.action_clean_params_cleanextent,
                mopMode: args.action_clean_params_mopmode
            });
        });
    } catch (err) {
        homey.app.error(err);
    }
};

// ---------------------------------------END OF FILE----------------------------------------------------------
