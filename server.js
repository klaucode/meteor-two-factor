/* globals twoFactor */

twoFactor.options = {};

const generateCode = () => {
    return Array(...Array(6))
        .map(() => {
            return Math.floor(Math.random() * 10);
        })
        .join('');
};

const NonEmptyString = Match.Where(x => {
    check(x, String);
    return x.length > 0;
});

const userQueryValidator = Match.Where(user => {
    check(user, {
        id: Match.Optional(NonEmptyString),
        username: Match.Optional(NonEmptyString),
        email: Match.Optional(NonEmptyString)
    });
    if (Object.keys(user).length !== 1) {
        throw new Match.Error('User property must have exactly one field');
    }
    return true;
});

const passwordValidator = {digest: String, algorithm: String};

const invalidLogin = () => {
    return new Meteor.Error(403, 'Invalid login credentials');
};

const getFieldName = () => {
    return twoFactor.options.fieldName || 'twoFactorCode';
};

Meteor.methods({
    'twoFactor.loginWithPassword': async function(options) {
        if (Meteor.userId())
            throw new Meteor.Error('Unable to login user, because user is already logged in!');

        check(options, {
            user: userQueryValidator,
            password: passwordValidator,
            method: String
        });

        const user = await Accounts._findUserByQuery(options.user);
        if (!user) {
            throw invalidLogin();
        }

        const checkPassword = await Accounts._checkPasswordAsync(user, options.password);
        if (checkPassword.error) {
            throw invalidLogin();
        }

        const settings = Meteor.settings?.TWOFACTOR?.public || {
            enabled: false,
            force: false
        }

        // If !user.twoFactorEnabled, login with password (skip 2FA)
        if (!settings.enabled || (!settings.force && !user.twoFactorEnabled)) {
            return Accounts._attemptLogin(this, 'login', '', {
                type: '2FALogin',
                userId: user._id,
            });
        }

        // If method not set, return list of available methods
        if(!options.method)
            return {
                email: !!user.profile.email || !!user.profile.emailAddress,
                phone: !!user.profile.phone || !!user.profile.phoneNumber
            }

        // If method is set, send authenticationCode immediately
        Meteor.call('twoFactor.getAuthenticationCode', options);
        return true;
    },
    'twoFactor.getAuthenticationCode': async function(options) {
        if (Meteor.userId())
            throw new Meteor.Error('Permission denied!');

        check(options, {
            user: userQueryValidator,
            password: passwordValidator,
            method: String
        });

        const fieldName = getFieldName();

        const user = await Accounts._findUserByQuery(options.user);
        if (!user) {
            throw invalidLogin();
        }

        const checkPassword = await Accounts._checkPasswordAsync(user, options.password);
        if (checkPassword.error) {
            throw invalidLogin();
        }

        const settings = Meteor.settings?.TWOFACTOR?.public || {
            enabled: false,
            force: false
        };

        if (!settings.enabled || (!user.twoFactorEnabled && !settings.force)) {
            return Accounts._attemptLogin(this, 'login', '', {
                type: '2FALogin',
                userId: user._id,
            });
        }

        const code =
            typeof twoFactor.generateCode === 'function'
                ? twoFactor.generateCode()
                : generateCode();

        if (typeof twoFactor.sendCode === 'function') {
            twoFactor.sendCode(user, code, options.method);
        }
        await Meteor.users.updateAsync(user._id, {
            $set: {
                [fieldName]: code
            }
        });
    },
    'twoFactor.verifyCodeAndLogin': async function(options) {
        if (Meteor.userId())
            throw new Meteor.Error('Permission denied!');

        check(options, {
            user: userQueryValidator,
            password: passwordValidator,
            code: String
        });

        const fieldName = getFieldName();

        const user = await Accounts._findUserByQuery(options.user);
        if (!user) {
            throw invalidLogin();
        }

        const checkPassword = await Accounts._checkPasswordAsync(user, options.password);
        if (checkPassword.error) {
            throw invalidLogin();
        }

        if (options.code !== user[fieldName]) {
            throw new Meteor.Error(403, 'Invalid code');
        }

        await Meteor.users.updateAsync(user._id, {
            $unset: {
                [fieldName]: ''
            }
        });

        return Accounts._attemptLogin(this, 'login', '', {
            type: '2FALogin',
            userId: user._id,
        });
    },
    'twoFactor.abort': async function(userQuery, password) {
        if (Meteor.userId())
            throw new Meteor.Error('Permission denied!');

        check(userQuery, userQueryValidator);
        check(password, passwordValidator);

        const fieldName = getFieldName();

        const user = await Accounts._findUserByQuery(userQuery);
        if (!user) {
            throw invalidLogin();
        }

        const checkPassword = await Accounts._checkPasswordAsync(user, password);
        if (checkPassword.error) {
            throw invalidLogin();
        }

        await Meteor.users.updateAsync(user._id, {
            $unset: {
                [fieldName]: '',
            },
        });
    }
});

Accounts.validateLoginAttempt(options => {
    const customValidator = () => {
        if (typeof twoFactor.validateLoginAttempt === 'function') {
            return twoFactor.validateLoginAttempt(options);
        }
        return false;
    };

    const allowedMethods = ['createUser', 'resetPassword', 'verifyEmail'];

    if (
        customValidator() ||
        options.type === 'resume' ||
        allowedMethods.indexOf(options.methodName) !== -1
    ) {
        return true;
    }

    if (options.type === '2FALogin' && options.methodName === 'login') {
        return options.allowed;
    }

    return false;
});