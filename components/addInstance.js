'use strict';

module.exports = new Vue({
  el: '#add_instance',
  methods : {
  	addInstance : function (event) {
  		this.$http.post('/-/v1/instances').then(function (result) {
  			location.reload();
  		}, console.error );
  	}
  }
})