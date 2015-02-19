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
  
  var dapi;
  
  var chains;
  
  var init = function(){
    console.log( 'hangout-effects initializing' );
    hapi.onApiReady.add(apiReady);
  };
  ex.init = init;
  
  var apiReady = function(){
    console.log('apiReady');
    
    token = param( 'token' );
    
    global.google.load('picker', '1', {'callback': pickerApiReady});
    global.gapi.client.load('drive', 'v2', driveApiReady);
    
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
  
  var driveApiReady = function(){
    dapi = global.gapi.client.drive;
    apisReady();
  };
  
  var pickerApiReady = function(){
    papi = global.google.picker;
    apisReady();
  };
  
  var apisReady = function(){
    if( dapi && papi ){
      buildPicker();
      
      $('#controls').html('');
      $('#controls').append('<button id="load">Load...</button>');
      $('#load').click(function(){
        picker.setVisible(true);
      });
    }
  };
  
  var buildPicker = function(){
    // We need to know the parent to find the right window to put the picker over
    var parentUrl = param('parent');
    var parent = param('parent',parentUrl);
    //parent = 'https://prisoner.com';   // FIXME
    console.log( 'parentUrl='+parentUrl+' parent='+parent );
    
    var view = new papi.DocsView()
      .setMimeTypes('application/json,text/plain');
    
    picker = new papi.PickerBuilder()
      .addView( view )
      //.addView( papi.ViewId.DOCS )
      .setOrigin( parent )
      .setOAuthToken( token )
      .setDeveloperKey( developerKey )
      .setCallback( fileSelected )
      .build();
  };
  
  var effectsListReady = function(notify){
    if( notify && notify.effect_descriptions ){
      console.log( notify );
      //console.log( JSON.stringify(notify.effect_descriptions) );
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
      var id = metadata.id;
      console.log( 'id='+id+' type='+metadata[papi.Document.MIME_TYPE]+' '+metadata[papi.Document.TYPE] );
      //loadFile( url, true );
      loadDriveFile( id );
    }
  };
  
  var loadDriveFile = function( id ){
    var at = global.gapi.auth.setToken({
      access_token: token
    });
    var req = dapi.files.get({
      'fileId': id
    });
    req.execute(function(resp){
      console.log( resp );
      var url = resp.downloadUrl;
      //var url = resp.webContentLink;
      loadFile( url, true );
    });
  };
  
  var loadFile = function( url, useToken ){
    console.log( url );
    var headers = {};
    if( useToken ){
      headers['Authorization'] = 'Bearer '+token;
    }
    $.ajax({
      url: url,
      headers: headers  
    }).done(function(data,status,xhr){
      console.log('loaded');
      chains = JSON.parse(data);
      showUserControls();
    }).fail(function(xhr,status,error){
      console.log( 'file load failed: '+error );
    });
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
      
      var showDebug = false;

      if( effectInfo ){
        var subEffect = metaEffect.createSubEffect( effectName, data );
        chain.push( subEffect );
  
        // If there are deltas to be applied, apply them
        if( data['x-delta'] ){
          data = applyDelta( data['x-delta'], effectInfo.params, data );
        }

      } else if( effectName == 'x-timeout' ){
        timeout = data['interval'];
        var debugEvery = data['debug'];
        if( debugEvery ){
          var debugCounter = data['debugCounter'];
          if( typeof debugCounter === 'undefined' ){
            debugCounter = 0;
          }
          showDebug = (debugCounter % debugEvery === 0);
          data['debugCounter'] = debugCounter+1;
        }
        
      } else {
        alert( "Unknown effect name: "+effectName );
        return;
      }

      dataChain[co] = data;
    }
    
    if( showDebug && console && console.log ){
      console.log( chain );
    }
    
    // Execute the chain
    metaEffect.initEffects( chain );
    metaEffect.pipelineEffects( chain );
    
    // If there is a frequency, setup our next timeout
    if( timeout > 0 ){
      timeoutId = setTimeout( function(){showEffects(dataChain);}, timeout );
    }
    
  };
  
  var applyDelta = function( deltaO, paramO, dataO ){
    for( var field in deltaO ){
      var deltaInfo = deltaO[field];
      if( typeof deltaInfo['x-delta'] === 'undefined' ){
        // There are nested objects. Recurse into them to handle
        dataO[field] = applyDelta( deltaO[field], paramO[field], dataO[field] );
        
      } else {
        var paramInfo = paramO[field];

        // Get the settings for the delta
        var delta = deltaInfo['x-delta'];
        dataO[field] += delta;
        
        // Compute min/max values from settings or from range defaults
        var min = deltaInfo['x-min'];
        if( typeof min === 'undefined' ){
          min = paramInfo.min;
        }
        var max = deltaInfo['x-max'];
        if( typeof max === 'undefined' ){
          max = paramInfo.max;
        }
        
        console.log( dataO );
        console.log( field );
        console.log( "dataO[field]="+dataO[field]+" min="+min+" max="+max );
        if( dataO[field] < min || dataO[field] > max ){
          // If we are outside the bounds, reverse direction and update
          deltaInfo['x-delta'] *= -1.0;
          delta *= -1.0;
          dataO[field] += delta;
        }

      }
    }
    return dataO;
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
