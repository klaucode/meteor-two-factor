Package.describe({
  name: 'nodsec:two-factor',
  version: '1.1.2',
  summary: 'Two-factor authentication for accounts-password forked from enhanced with verification method',
  git: 'https://github.com/nodsec/meteor-two-factor.git',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('2.3.1');
  api.use(['ecmascript', 'check']);
  api.use('reactive-dict', 'client');
  api.use('accounts-password', 'server');
  api.addFiles('common.js');
  api.addFiles('client.js', 'client');
  api.addFiles('server.js', 'server');
  api.export('twoFactor');
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('nodsec:two-factor');
  api.addFiles('tests.js');
});
