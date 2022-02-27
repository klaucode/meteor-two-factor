# Meteor Two Factor

Simple two factor authentication for accounts-password forked from (https://github.com/dburles/meteor-two-factor)
and enhanced with possibility to test verification method


## Installation

```sh
$ meteor add nodsec:two-factor
```

## Prerequisites

Make sure your project is using Meteor's `accounts-password` package, if not add it: `meteor add accounts-password`

## Example Application

[Simple example application](https://github.com/dburles/two-factor-example)

## Usage

Client and server usage examples.

## Usage (Client)

Typically you would call this method via your application login form event handler:

```js
twoFactor.loginWithPassword(user, password, method, error => {
    if (error) {
        // Handle the error
    }
    // Success!
});
```

```json
{
  "TWOFACTOR": {
    "public": {
      "enabled": true,
      "force": true
    }
  }
}

```

### Settings short explanation

- `settings.enabled` if set to false, 2FA is disabled and method `twoFactor.loginWithPassword` will log in user without 2FA.

- `settings.force` will always require 2FA verification also, if user have `user.twoFactorEnabled` set to false,

After calling `loginWithPassword` if you wish, you can request a new authentication code:

```js
twoFactor.getNewAuthCode(error => {
    if (error) {
        // Handle the error
    }
    // Success!
});
```

The following method is reactive and represents the state of authentication. Use it to display the interface to enter the authentication code:

```js
Tracker.autorun(function () {
    if (twoFactor.isVerifying()) {
        console.log('Ready to enter authentication code!');
    }
});
```

Capture the authentication code and pass it to the following method to validate the code and log the user in:

```js
twoFactor.verifyAndLogin(code, error => {
    if (error) {
        // Handle the error
    }
    // Success!
});
```

## Usage (Server)

Assign a function to `twoFactor.sendCode` that sends out the code. The example below sends the user an email:

```js
twoFactor.loginWithPassword = (options) => {
    const user = options.user;
    const method = options.method;

    // Don't hold up the client
    Meteor.defer(() => {
        if (options.method === 'email') {
            // Send code via email
            Email.send({
                to: user.email(), // Method attached using dburles:collection-helpers
                from: 'noreply@example.com',
                subject: 'Your authentication code',
                text: `${code} is your authentication code.`
            });
        } else if (options.method === 'sms') {
            // Send code via SMS
            // ...
        }
    });
};
```

```js
twoFactor.sendCode = (user, code) => {
    // Don't hold up the client
    Meteor.defer(() => {
        // Send code via email
        Email.send({
            to: user.email(), // Method attached using dburles:collection-helpers
            from: 'noreply@example.com',
            subject: 'Your authentication code',
            text: `${code} is your authentication code.`
        });
    });
};
```

**Optional functions:**

```js
// Optional
// Conditionally allow regular or two-factor sign in
twoFactor.validateLoginAttempt = options => {
    return !!options.user.twoFactorEnabled;
};
```

```js
// Optional
twoFactor.generateCode = () => {
    // return a random string
};
```

## API

The following functions are attached to the `twoFactor` namespace. This may change somewhat for Meteor 1.3.

## API (Client)

### loginWithPassword

```
loginWithPassword(user, password, method, [callback])
```

Generates an authentication code. Once generated, (by default) a `twoFactorCode` field is added to the current user document. This function mirrors [Meteor.loginWithPassword](http://docs.meteor.com/#/full/meteor_loginwithpassword).

**user** Either a string interpreted as a username or an email; or an object with a single key: email, username or id. Username or email match in a case insensitive manner.

**password** The user's password.

**method** Method (email/sms/...) of to send verification code.

**callback** Optional callback. Called with no arguments on success, or with a single Error argument on failure.


### getAuthCode

```js
getNewAuthCode(method, [callback])
```
Generates and send a new authentication code. Only functional while verifying.

**method** Method (email/sms/...) of to send verification code.

**callback** Optional callback. Called with no arguments on success, or with a single Error argument on failure.


### getNewAuthCode

```js
getNewAuthCode([callback])
```

Generates and send a new authentication code. Only functional while verifying.

**callback** Optional callback. Called with no arguments on success, or with a single Error argument on failure.

### verifyAndLogin

```js
verifyAndLogin(code, [callback])
```

Verifies authentication code and logs in the user.

**code** The authentication code.

**callback** Optional callback. Called with no arguments on success, or with a single Error argument on failure.

### isVerifying

```js
isVerifying()
```

Reactive function that indicates the current state between having generated an authentication code and awaiting verification.

## API (Server)

### sendCode

```
sendCode(user, code, method)
```

This function is called after `getAuthCode` is successful.

**user** The current user document.

**code** The generated authentication code.

**method** The method of the send verification code.

### options

```
twoFactor.options.fieldName = 'customFieldName';
```

Specify the name of the field on the user document to write the authentication code. Defaults to `twoFactorCode`.

### validateLoginAttempt (Optional)

```
validateLoginAttempt(options)
```

If defined, this function is called within an `Accounts.validateLoginAttempt` callback. Use this to allow regular login under certain conditions.

### generateCode (Optional)

If defined, this function is called to generate the random code instead of the default.

# License

MIT
