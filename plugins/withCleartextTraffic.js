const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withCleartextTraffic = (config) => {
  // 1. Set android:usesCleartextTraffic="true" and android:networkSecurityConfig in AndroidManifest.xml
  config = withAndroidManifest(config, async (cfg) => {
    const androidManifest = cfg.modResults.manifest;
    if (androidManifest.application && androidManifest.application.length > 0) {
      const app = androidManifest.application[0];
      app.$ = app.$ || {};
      app.$['android:usesCleartextTraffic'] = 'true';
      app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    }
    return cfg;
  });

  // 2. Write network_security_config.xml into res/xml during prebuild
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const xmlDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      const xmlPath = path.join(xmlDir, 'network_security_config.xml');
      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;
      fs.writeFileSync(xmlPath, xmlContent, 'utf-8');
      return cfg;
    },
  ]);

  return config;
};

module.exports = withCleartextTraffic;
