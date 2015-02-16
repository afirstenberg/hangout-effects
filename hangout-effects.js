(function(global){
  var ex = {};
  
  var $ = global.$;
  var hapi = global.gapi.hangout;
  
  var token;
  var developerKey = 'AIzaSyBThmoCmPIgAVWU8ItPCIarKwlNXBJehEs';
  
  var metaEffect;
  var effect = {};
  var timeoutId;
  
  var papi;
  var picker;
  
  var chains = {
    'Stop': [],
    'Fisheye Fast': [
      {
        "x-name":"fisheye",
        "scale": 0.0,
        "x-delta": {
          "scale": {
            "delta": 0.1,
            "min": 0.1,
            "max": 0.5
          }
        }
      },
      {
        "x-name": "x-timeout",
        "interval": 50
      }
    ],
    'Fisheye Slow': [
      {
        "x-name":"fisheye",
        "scale": 0.1,
        "x-delta": {
          "scale": {
            "delta": 0.1
          }
        }
      },
      {
        "x-name": "x-timeout",
        "interval": 100
      }
    ]
  };
  
  var init = function(){
    console.log( 'hangout-effects initializing' );
    hapi.onApiReady.add(apiReady);
  };
  ex.init = init;
  
  var apiReady = function(){
    console.log('apiReady');
    
    token = param( 'token' );
    
    global.google.load('picker', '1', {'callback': pickerApiReady});
    
    metaEffect = hapi.av.effects.createMetaEffect();
    metaEffect.onNotify.add( effectsListReady );
    metaEffect.getEffectDescriptions();
    
  };
  
  var param = function( name, paramSource ){
    if( !paramSource ){
      paramSource = global.location.search.substring(1);
    }
    var params = paramSource.split('&');
    
    for( var co=0; co<params.length; co++ ){
      var nameVal = params[co].split('=');
      if( nameVal[0] === name ){
        return unescape(nameVal[1]);
      }
    }
    
    return null;
  };
  
  var pickerApiReady = function(){
    papi = global.google.picker;
    buildPicker();
    
    $('#controls').html('');
    $('#controls').append('<button id="load">Load...</button>');
    $('#load').click(function(){
      picker.setVisible(true);
    });
  };
  
  var buildPicker = function(){
    // We need to know the parent to find the right window to put the picker over
    var parentUrl = param('parent');
    var parent = param('parent',parentUrl);
    //parent = 'https://prisoner.com';   // FIXME
    console.log( 'parentUrl='+parentUrl+' parent='+parent );
    
    var view = new papi.DocsView()
      .setMimeTypes('application/json,text/pain');
    
    picker = new papi.PickerBuilder()
      .addView( papi.ViewId.DOCS )
      .setOrigin( parent )
      .setOAuthToken( token )
      .setDeveloperKey( developerKey )
      .setCallback( fileSelected )
      .build();
  };
  
  var effectsListReady = function(notify){
    if( notify && notify.effect_descriptions ){
      console.log( notify );
      for( var co=0; co<notify.effect_descriptions.length; co++ ){
        var desc = notify.effect_descriptions[co];
        var effectId = desc.id;
        effect[effectId] = desc;
      } 
      metaEffect.onNotify.remove( effectsListReady );
    }
  };
  
  var fileSelected = function( picked ){
    if( picked[papi.Response.ACTION] === papi.Action.PICKED ){
      var metadata = picked[papi.Response.DOCUMENTS][0];
      var url = metadata[papi.Document.URL];
      loadFile( url, true );
    }
  };
  
  var loadFile = function( url, useToken ){
    console.log( url );
    // TODO - continue here
  };
  
  var showUserControls = function(){
    $('#sidebar #user-controls').html('');
    for( var name in chains ){
      $('#sidebar #user-controls').append('<button data-chain="'+name+'">'+name+'</button>');
    }
    $('#sidebar #user-controls button').click(function(){
      var name = $(this).data('chain');
      var chain = chains[name];
      showEffects( chain );
    });
  };
  
  var showEffects = function( dataChain ){
    
    // If we had a timeout, clear it, in case we are showing new effects
    if( typeof timeoutId !== 'undefined' ){
      clearTimeout( timeoutId );
      timeoutId = undefined;
    }
    var timeout = 0;
    
    // Create the new chain to execute
    var chain = [];
    
    for( var co=0; co<dataChain.length; co++ ){
      var data = dataChain[co];
      var effectName = data['x-name'];
      var effectInfo = effect[effectName];

      if( effectInfo ){
        var subEffect = metaEffect.createSubEffect( effectName, data );
        chain.push( subEffect );
  
        // If there are deltas to be applied, apply them
        var deltaFields = data['x-delta'];
        if( deltaFields ){
          for( var deltaField in deltaFields ){
            var paramInfo = effectInfo.params[deltaField];
            var deltaVal = deltaFields[deltaField];
            
            // Get the settings for the delta
            var delta = deltaVal['delta'];
            data[deltaField] += delta;
            
            // Compute min/max values from settings or from range defaults
            var min = deltaVal['min'];
            if( typeof min === 'undefined' ){
              min = paramInfo.min;
            }
            var max = deltaVal['max'];
            if( typeof max === 'undefined' ){
              max = paramInfo.max;
            }
            
            if( data[deltaField] < min || data[deltaField] > max ){
              // If we are outside the bounds, reverse direction and update
              deltaVal['delta'] *= -1.0;
              delta *= -1.0;
              data[deltaField] += delta;
            }
          }
        }
        
      } else if( effectName == 'x-timeout' ){
        timeout = data['interval'];
      }

    }
    
    // Execute the chain
    metaEffect.initEffects( chain );
    metaEffect.pipelineEffects( chain );
    
    // If there is a frequency, setup our next timeout
    if( timeout > 0 ){
      timeoutId = setTimeout( function(){showEffects(dataChain);}, timeout );
    }
    
  };
  
  var locate = function(){
    console.log( 'locate' );
    var chain = [];
    
    var faceData = {
      'get_face_data': {
        'default': true
      }
    };
    
    chain.push( metaEffect.createSubEffect( 'face_data', faceData ));

    metaEffect.initEffects( chain );
    metaEffect.pipelineEffects( chain );
    
    console.log( faceData );
  };
  
  var cropFace = function(){
    var chain = [];
    console.log( 'crop 640/360-'+scale );
    
    chain.push( metaEffect.createSubEffect( 'crop_face', {
      scale: scale,
      width: 640,
      height: 360
    }));
    
    /*
    chain.push( metaEffect.createSubEffect( 'swap', {
      resource_key: 'crop'
    }));
    
    chain.push( metaEffect.createSubEffect( 'static_overlay', {
      resource: {key:'crop'},
      h_align: 0.5,
      v_align: 0  
    }));
    */
    
    metaEffect.initEffects( chain );
    metaEffect.pipelineEffects( chain );
    
    scale += delta;
    // Question - why is scale documented to go to 20?
    if( scale < 0.0 || scale > 4.0 ){
      delta *= -1.0;
      scale += delta;
    }
  };

  window.effects = ex;
})(this);

console.log( 'hangouts-effects.js loaded' );
console.log( effects );
