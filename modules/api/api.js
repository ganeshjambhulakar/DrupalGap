drupalgap.api = {
'options':{ /* these are set by drupalgap_api_default_options() */ },
  'call':function(options){
    try {
      // Get the default api options, then adjust to the caller's options if they are present.
      var api_options = drupalgap_api_default_options();

      // Now assemble the callbacks together.
      var call_options = drupalgap_chain_callbacks(api_options, options);

      // TODO - this is a good spot for a hook, e.g. hook_drupalgap_api_preprocess

      // Build the Drupal URL path to call if one hasn't been assembled already
      // by the caller.
      if (!call_options.url || call_options.url == '') {
        call_options.url = call_options.site_path + drupalgap.settings.base_path;
        if (!drupalgap.settings.clean_urls) {
          call_options.url += '?q=';
        }
        if (call_options.endpoint) {
          call_options.url += call_options.endpoint + '/';
        }
        call_options.url += options.path;
      }

      // Make sure the device is online, if it isn't send the
      // user to the offline page.
      drupalgap_check_connection();
      if (!drupalgap.online) {
        navigator.notification.alert(
          'No network connection!',
          function(){ drupalgap_goto('offline'); },
          'Offline',
          'OK'
        );
        return false;
      }
      
      if (drupalgap.settings.debug) {
        console.log('' + call_options.url);
      }
      
      // Get CSRF token.
      _drupalgap_api_get_csrf_token(call_options, {
          success:function() {
            
            //alert(call_options.url);
            
            // Show the loading icon.
            $.mobile.loading('show', {theme: "b", text: "Loading"});
            
            // Build api call object options.
            var api_object = {
              url: call_options.url,
              type: call_options.type,
              data: call_options.data,
              dataType: call_options.dataType,
              async: true,
              error: call_options.error,
              success: call_options.success
            }
            
            // Synchronous call?
            if (!call_options.async) {
              api_object.async = false;
            }
            
            // If there are any beforeSend declarations, attach them to the api
            // call object.
            if (call_options.beforeSend) {
              api_object.beforeSend = call_options.beforeSend;
            }
            
            // Make the call.
            if (drupalgap.settings.debug) {
              console.log(JSON.stringify(api_object));
            }
            $.ajax(api_object);      
          }
      });
    }
    catch (error) {
      navigator.notification.alert(
        error,
        function(){},
        'DrupalGap API Error',
        'OK'
      );
    }
  }
};

/**
 * Given the API's call options and a JSON object containing a success and error
 * callback, this will append a CSRF token to the API call's request header, if
 * necessary.
 */
function _drupalgap_api_get_csrf_token(call_options, options) {
  try {
    // Anonymous users don't need the CSRF token.
    if (drupalgap.user.uid == 0) {
      options.success.call();
      return;
    }
    // We have an authenicated user, do we need a token for this call?
    var types = ['GET', 'HEAD', 'OPTIONS', 'TRACE'];
    if ($.inArray(call_options.type.toUpperCase(), types) == -1) {
      // We need a token, is there one in drupalgap.sessid?
      var token = drupalgap.sessid; 
      if (!token) {
        // There wasn't one available in drupalgap.sessid, is there one in
        // local storage?
        token = window.localStorage.getItem('sessid');
      }
      if (!token) {
        // We don't have a previous token to use, let's grab one from Drupal.
        var token_url = drupalgap.settings.site_path +
                        drupalgap.settings.base_path +
                        '?q=services/session/token';
        $.ajax({
            url:token_url,
            type:'get',
            dataType:'text',
            success:function(token){
              // Save the token to local storage as sessid, set drupalgap.sessid
              // with the token, attach the token and the request header to the
              // call options, then return via the success function.
              window.localStorage.setItem('sessid', token);
              drupalgap.sessid = token;
              call_options.token = token;
              call_options.beforeSend = function (request) {
                request.setRequestHeader("X-CSRF-Token", call_options.token);
              };
              options.success.call();
            },
            error:function (jqXHR, textStatus, errorThrown) {
              alert('Failed to retrieve CSRF token! (' + errorThrown +
                    ') You must upgrade your Drupal Services module to version 3.4 (or above)! ' +
                    'Also check your device for a connection, and try logging out and then back in!');
            }
        });
      }
      else {
        // We had a previous token available, let's use it by attaching it
        // to the call options and the CSRF header.
        call_options.token = token;
        call_options.beforeSend = function (request) {
          request.setRequestHeader("X-CSRF-Token", call_options.token);
        };
        options.success.call();
      }
    }
    else {
      // This call's HTTP method doesn't need a token, so we return via the
      // success function.
      options.success.call();
    }
  }
  catch (error) {
    alert('_drupalgap_api_get_csrf_token - ' + error);
  }
}

function drupalgap_api_default_options() {
  var default_options = {};
  default_options = {
    'url':'',
    'type':'get',
    'async':true,
    'data':'',
    'dataType':'json',
    'endpoint':drupalgap.settings.default_services_endpoint,
    'site_path':drupalgap.settings.site_path,
    'success':function(result){
      // TODO - this is a good spot for a hook
      // e.g. hook_drupalgap_api_postprocess
      // Hide the loading message.
      $.mobile.hidePageLoadingMsg();
      // If debugging is turned on, print the result to the console.
      if (drupalgap.settings.debug) {
        // Note: http://stackoverflow.com/a/11616993/763010
        var cache = [];
        console.log(JSON.stringify(result, function(key, value) {
            if (typeof value === 'object' && value !== null) {
              if (cache.indexOf(value) !== -1) {
                // Circular reference found, discard key
                return;
              }
              // Store value in our collection
              cache.push(value);
            }
            return value;
        }));
        cache = null; // Enable garbage collection
      }
    },
    'error':function(jqXHR, textStatus, errorThrown, url){
      // TODO - this is a good spot for a hook
      // e.g. hook_drupalgap_api_postprocess
      $.mobile.hidePageLoadingMsg();
      console.log(JSON.stringify({
        "jqXHR":jqXHR,
        "textStatus":textStatus,
        "errorThrown":errorThrown,
      }));
      extra_msg = '';
      if (jqXHR.statusText && jqXHR.statusText != errorThrown) {
        extra_msg = '[' + jqXHR.statusText + ']';
      }
      else if (jqXHR.responseText && jqXHR.responseText != errorThrown) {
        extra_msg = jqXHR.responseText;
      }
      //if (this.error_alert) {
        navigator.notification.alert(
          textStatus + ' (' + errorThrown + ') ' + extra_msg + '[' + url + ']',
          function(){},
          'DrupalGap API Call Error',
          'OK'
        );
      //}
    },
    'error_alert':true, /* an option to supress the default error call back's
                           alert dialog window, use: options.error_alert = false;
                           use with caution */
  };
  return default_options;
}

/**
 * When the app is first loading up, DrupalGap checks to see if the device has
 * a connection, if it does then this hook is called. Implementations of this
 * hook need to return true if they'd like DrupalGap to continue, or return
 * false if you'd like DrupalGap to NOT continue. If DrupalGap continues, it
 * will perform a System Connect resource call then go to the App's front page.
 * This is called during DrupalGap's "deviceready" implementation for PhoneGap.
 */
function hook_deviceready() {
  
}

// TODO - list all other core hooks here.

function hook_mvc_model() {
  var models = {};
  return models;
}

function hook_mvc_view() {
}

function hook_mvc_controller() {
}

