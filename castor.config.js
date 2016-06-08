'use strict';
// to allow mongodb host and port injection thanks
// to the EZMASTER_MONGODB_HOST_PORT environment parameter
// (docker uses it)
var mongoHostPort = process.env.EZMASTER_MONGODB_HOST_PORT ?
                    process.env.EZMASTER_MONGODB_HOST_PORT :
                    'localhost:27017';

var domainProxy = process.env.EZMASTER_PUBLIC_DOMAIN ?
                  process.env.EZMASTER_PUBLIC_DOMAIN :
                  null;

module.exports = {
  connectionURI: 'mongodb://' + mongoHostPort + '/ezmaster',
  collectionName: 'data',
  domainProxy: domainProxy,
  browserifyModules : [
    'vue'
    , 'vue-resource'
    , 'components/addInstance'
    , 'components/table'
    , 'vue-validator'
    , 'heartbeats'
  ],
  rootURL : '/',
  routes: [
    'route.js',
    'status.js'
  ],
  middlewares: {
    '/*': 'reverseproxy.js'
  },

  filters: ['jbj-parse']
};


module.exports.package = require('./package.json');
