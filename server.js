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

const prepareUserSelector = (options) => {
    // Trim string and make lowercase
    const prepareString = function (str) {
        str = String.prototype.trim.call(str);
        str = String.prototype.toLowerCase.call(str);
        return str;
    }

    const selector = options.user;
    if(selector.email)
        selector.email = prepareString(selector.email);

    if(selector.username)
        selector.username = prepareString(selector.username);

    // For sure, check type again
    check(selector, userQueryValidator)

    return selector;
}

Meteor.methods({
    'twoFactor.loginWithPassword'(options) {
        if (Meteor.userId())
            throw new Meteor.Error('Permission denied!');

        check(options, {
            user: userQueryValidator,
            password: passwordValidator,
            method: String
        });

        const selector = prepareUserSelector(options);

        const user = Accounts._findUserByQuery(selector);
        if (!user || !user.services || !user.services.password) {
            throw invalidLogin();
        }

        const checkPassword = Accounts._checkPassword(user, options.password);
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
                email: !!user.profile.email,
                phone: !!user.profile.phone
            }

        // If method is set, send authenticationCode immediately
        Meteor.call('twoFactor.getAuthenticationCode', options);
        return true;
    },
    'twoFactor.getAuthenticationCode'(options) {
        if (Meteor.userId())
            throw new Meteor.Error('Permission denied!');

        check(options, {
            user: userQueryValidator,
            password: passwordValidator,
            method: String
        });

        const fieldName = getFieldName();

        const user = Accounts._findUserByQuery(options.user);
        if (!user) {
            throw invalidLogin();
        }

        const checkPassword = Accounts._checkPassword(user, options.password);
        if (checkPassword.error) {
            throw invalidLogin();
        }

        const settings = Meteor.settings?.TWOFACTOR?.public || {
            enabled: false,
            force: false
        };

        // If settings.enabled and settings.force or user.twoFactorEnabled, send 2FA code
        if (settings.enabled && (settings.force || user.twoFactorEnabled)) {
            const code =
                typeof twoFactor.generateCode === 'function'
                    ? twoFactor.generateCode()
                    : generateCode();

            if (typeof twoFactor.sendCode === 'function') {
                twoFactor.sendCode(user, code, options.method);
            }

            Meteor.users.update(user._id, {
                $set: {
                    [fieldName]: code
                }
            });
        }
    },
    'twoFactor.verifyCodeAndLogin'(options) {
        if (Meteor.userId())
            throw new Meteor.Error('Permission denied!');

        check(options, {
            user: userQueryValidator,
            password: passwordValidator,
            code: String
        });

        const fieldName = getFieldName();

        const user = Accounts._findUserByQuery(options.user);
        if (!user) {
            throw invalidLogin();
        }

        const checkPassword = Accounts._checkPassword(user, options.password);
        if (checkPassword.error) {
            throw invalidLogin();
        }

        if (options.code !== user[fieldName]) {
            throw new Meteor.Error(403, 'Invalid code');
        }

        Meteor.users.update(user._id, {
            $unset: {
                [fieldName]: ''
            }
        });

        return Accounts._attemptLogin(this, 'login', '', {
            type: '2FALogin',
            userId: user._id,
        });
    },
    'twoFactor.abort'(userQuery, password) {
        if (Meteor.userId())
            throw new Meteor.Error('Permission denied!');

        check(userQuery, userQueryValidator);
        check(password, passwordValidator);

        const fieldName = getFieldName();

        const user = Accounts._findUserByQuery(userQuery);
        if (!user) {
            throw invalidLogin();
        }

        const checkPassword = Accounts._checkPassword(user, password);
        if (checkPassword.error) {
            throw invalidLogin();
        }

        Meteor.users.update(user._id, {
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