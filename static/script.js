/**
 * @fileoverview Runs the Trendy Lights application. The code is executed in the
 * user's browser. It communicates with the App Engine backend, renders output
 * to the screen, and handles user interactions.
 */

trendy = {};  // Our namespace.

/**
 * Starts the Trendy Lights application. The main entry point for the app.
 * @param {string} eeMapId The Earth Engine map ID.
 * @param {string} eeToken The Earth Engine map token.
 * @param {string} serializedPolygonIds A serialized array of the IDs of the
 *     polygons to show on the map. For example: "['poland', 'moldova']".
 */
trendy.boot = function(historicalEeMapId, mostRecentEeMapId, historicalEeToken, mostRecentEeToken, serializedPolygonIds) {
  // Load external libraries.
  google.load('visualization', '1.0');
  google.load('jquery', '1');
  //  this key has domain restrictions associated with it
  google.load('maps', '3', {'other_params': 'key=AIzaSyDraxoLomEu1kNGyDFpb6K-SU4FSmAFZWc'});
  // Create the Trendy Lights app.
  google.setOnLoadCallback(function() {
    //var mapType = trendy.App.getEeMapType(historicalEeMapId, historicalEeToken);
    trendy.App.historicalLayer = trendy.App.getEeMapType(historicalEeMapId, historicalEeToken);
    trendy.App.mostRecentLayer = trendy.App.getEeMapType(mostRecentEeMapId, mostRecentEeToken);
    // calls createMap() with our historical layer
    trendy.App(trendy.App.historicalLayer, JSON.parse(serializedPolygonIds));
    trendy.App.addLayer(trendy.App.mostRecentLayer, id='mostRecent');
  });
};


///////////////////////////////////////////////////////////////////////////////
//                               The application.                            //
///////////////////////////////////////////////////////////////////////////////



/**
 * The main Trendy Lights application.
 * This constructor renders the UI and sets up event handling.
 * @param {google.maps.ImageMapType} mapType The map type to render on the map.
 * @param {Array<string>} polygonIds The IDs of the polygons to show on the map.
 *     For example ['poland', 'moldova'].
 * @constructor
 */
trendy.App = function(mapType, polygonIds) {
  // Create and display the map.
  trendy.App.createMap(mapType);
  // Fix our default zoom levels
  // Add a move listener to restrict the bounds range
  trendy.App.map.addListener(trendy.App.map, "drag", function() {
    trendy.App.checkBounds();
  });
  // Pan to the user's current location
  //this.panToLocation(this.map);
  // Add polygons to the map.
  // this.addPolygons(polygonIds);

  // Register a click handler to show a panel when the user clicks on a place.
  // this.map.data.addListener('click', this.handlePolygonClick.bind(this));

  // Register a click handler to hide the panel when the user clicks close.
  $('.panel .close').click(trendy.App.hidePanel.bind(this));

  // Register a click handler to expand the panel when the user taps on toggle.
  $('.panel .toggler').click((function() {
    $('.panel').toggleClass('expanded');
  }).bind(this));
};


/**
 * Creates a Google Map with a black background the given map type rendered.
 * The map is anchored to the DOM element with the CSS class 'map'.
 * @param {google.maps.ImageMapType} mapType The map type to include on the map.
 * @return {google.maps.Map} A map instance with the map type rendered.
 */
trendy.App.createMap = function(mapType) {
  // initialize our layers stack
  trendy.App.numLayers = 0;
  trendy.App.defaultMapOptions = {
    backgroundColor: '#00000',
    center: trendy.App.DEFAULT_CENTER,
    zoom: trendy.App.DEFAULT_ZOOM,
    minZoom: 8,
    maxZoom: 14
  };
                                          //Lower, Left           //Upper, Right
  trendy.App.allowedBounds = new google.maps.LatLngBounds(new google.maps.LatLng(37,-102), new google.maps.LatLng(40.1,-94.58));
  
  var mapEl = $('.map').get(0);
  trendy.App.map = new google.maps.Map(mapEl, trendy.App.defaultMapOptions);

  trendy.App.map.setOptions({styles: trendy.App.BASE_MAP_STYLE});
  trendy.App.addLayer(mapType, is='historical');
};
/**
 * Add an additional layer to an existing map object
 */
 trendy.App.addLayer = function(mapType, id){
    trendy.App.map.overlayMapTypes.push(mapType);
    trendy.App.numLayers += 1
    if(id.includes("istor")){
      trendy.App.historicalLayer.at = (trendy.App.numLayers-1)
    } else if(id.includes("ecent")) {
      trendy.App.mostRecentLayer.at = (trendy.App.numLayers-1)
    } 
 }
 trendy.App.removeLayer = function(id){
   if(id.includes("historical")){
     trendy.App.map.overlayMapTypes.removeAt(trendy.App.historicalLayer.at);
     trendy.App.historicalLayer.at = null
     trendy.App.numLayers -= 1
     // if we still have the other layer on the map, adjust it's array pos
     if(trendy.App.mostRecentLayer.at){
       trendy.App.mostRecentLayer.at -= 1
     }
   } else if(id.includes("ecent")){
     trendy.App.map.overlayMapTypes.removeAt(trendy.App.mostRecentLayer.at);
     trendy.App.mostRecentLayer.at = null
     trendy.App.numLayers -= 1
     // if we still have the other layer on the map, adjust it's array pos
     if(trendy.App.historicalLayer.at){
       trendy.App.historicalLayer.at -= 1
     }
   }
 }
/**
 * If the map position is out of range, move it back
 */
trendy.App.checkBounds = function() {
      // Perform the check and return if OK
      if (trendy.App.allowedBounds.contains(trendy.App.map.getCenter())) {
        return;
      }
      // If it`s not OK, find the nearest allowed point and move there
      var C = map.getCenter();
      var X = C.lng();
      var Y = C.lat();

      var AmaxX = trendy.App.allowedBounds.getNorthEast().lng();
      var AmaxY = trendy.App.allowedBounds.getNorthEast().lat();
      var AminX = trendy.App.allowedBounds.getSouthWest().lng();
      var AminY = trendy.App.allowedBounds.getSouthWest().lat();

      if (X < AminX) {X = AminX;}
      if (X > AmaxX) {X = AmaxX;}
      if (Y < AminY) {Y = AminY;}
      if (Y > AmaxY) {Y = AmaxY;}
      //alert ("Restricting "+Y+" "+X);
      trendy.App.map.panTo(new google.maps.LatLng(X,Y));
}
/**
 * Create a marker from location services and pan the map to the user's current 
 * location
 */
trendy.App.panToLocation = function(){
  // Add the default 'go to my location' control
  var myLocationIcon = new google.maps.Marker({
    clickable: false,
    icon: new google.maps.MarkerImage('//maps.gstatic.com/mapfiles/mobile/mobileimgs2.png',
                                                    new google.maps.Size(22,22),
                                                    new google.maps.Point(0,18),
                                                    new google.maps.Point(11,11)),
    shadow: null,
    zIndex: 999,
    map: trendy.App.map
  });
  if (navigator.geolocation) navigator.geolocation.getCurrentPosition(function(pos) {
      var me = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
      myLocationIcon.setPosition(me);
      trendy.App.map.panTo(me);
      // this.map.setCenter(me);
  }, function(error) {
      console.log(error)
  });
}
/**
 * Adds the polygons with the passed-in IDs to the map.
 * @param {Array<string>} polygonIds The IDs of the polygons to show on the map.
 *     For example ['poland', 'moldova'].
 */
trendy.App.addPolygons = function(polygonIds) {
  polygonIds.forEach((function(polygonId) {
    trendy.App.map.data.loadGeoJson('static/polygons/' + polygonId + '.json');
  }).bind(this));
  trendy.App.map.data.setStyle(function(feature) {
    return {
      fillColor: 'white',
      fillOpacity: '0.1',
      strokeColor: 'white',
      strokeWeight: 1
    };
  });
};


/**
 * Handles a on click a polygon. Highlights the polygon and shows details about
 * it in a panel.
 * @param {Object} event The event object, which contains details about the
 *     polygon clicked.
 */
trendy.App.handlePolygonClick = function(event) {
  trendy.App.clear();
  var feature = event.feature;

  // Instantly higlight the polygon and show the title of the polygon.
  trendy.App.map.data.overrideStyle(feature, {strokeWeight: 8});
  var title = feature.getProperty('title');
  $('.panel').show();
  $('.panel .title').show().text(title);

  // Asynchronously load and show details about the polygon.
  var id = feature.getProperty('id');
  $.get('/details?polygon_id=' + id).done((function(data) {
    if (data['error']) {
      $('.panel .error').show().html(data['error']);
    } else {
      $('.panel .wiki-url').show().attr('href', data['wikiUrl']);
      trendy.App.showChart(data['timeSeries']);
    }
  }).bind(this));
};


/** Clears the details panel and selected polygon. */
trendy.App.clear = function() {
  $('.panel .title').empty().hide();
  $('.panel .wiki-url').hide().attr('href', '');
  $('.panel .chart').empty().hide();
  $('.panel .error').empty().hide();
  $('.panel').hide();
  trendy.App.map.data.revertStyle();
};


/** Hides the details panel. */
trendy.App.hidePanel = function() {
  $('.panel').hide();
  trendy.App.clear();
};


/**
 * Shows a chart with the given timeseries.
 * @param {Array<Array<number>>} timeseries The timeseries data
 *     to plot in the chart.
 */
trendy.App.showChart = function(timeseries) {
  timeseries.forEach(function(point) {
    point[0] = new Date(parseInt(point[0], 10));
  });
  var data = new google.visualization.DataTable();
  data.addColumn('date');
  data.addColumn('number');
  data.addRows(timeseries);
  var wrapper = new google.visualization.ChartWrapper({
    chartType: 'LineChart',
    dataTable: data,
    options: {
      title: 'Brightness over time',
      curveType: 'function',
      legend: {position: 'none'},
      titleTextStyle: {fontName: 'Roboto'}
    }
  });
  $('.panel .chart').show();
  var chartEl = $('.chart').get(0);
  wrapper.setContainerId(chartEl);
  wrapper.draw();
};


///////////////////////////////////////////////////////////////////////////////
//                        Static helpers and constants.                      //
///////////////////////////////////////////////////////////////////////////////


/**
 * Generates a Google Maps map type (or layer) for the passed-in EE map id. See:
 * https://developers.google.com/maps/documentation/javascript/maptypes#ImageMapTypes
 * @param {string} eeMapId The Earth Engine map ID.
 * @param {string} eeToken The Earth Engine map token.
 * @return {google.maps.ImageMapType} A Google Maps ImageMapType object for the
 *     EE map with the given ID and token.
 */
trendy.App.getEeMapType = function(eeMapId, eeToken) {
  var eeMapOptions = {
    getTileUrl: function(tile, zoom) {
      var url = trendy.App.EE_URL + '/map/';
      url += [eeMapId, zoom, tile.x, tile.y].join('/');
      url += '?token=' + eeToken;
      return url;
    },
    tileSize: new google.maps.Size(256, 256)
  };
  return new google.maps.ImageMapType(eeMapOptions);
};


/** @type {string} The Earth Engine API URL. */
trendy.App.EE_URL = 'https://earthengine.googleapis.com';


/** @type {number} The default zoom level for the map. */
trendy.App.DEFAULT_ZOOM = 10;


/** @type {Object} The default center of the map. */
trendy.App.DEFAULT_CENTER = {lng: -101.1091876, lat: 38.2976897};

/**
 * @type {Array} An array of Google Map styles. See:
 *     https://developers.google.com/maps/documentation/javascript/styling
 */
//trendy.App.BLACK_BASE_MAP_STYLES = [
//  {stylers: [{lightness: -100}]},
//  {
//    featureType: 'road',
//    elementType: 'labels',
//    stylers: [{visibility: 'off'}]
//  }
//];

trendy.App.BASE_MAP_STYLE = [
  {
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#ebe3cd"
      }
    ]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#523735"
      }
    ]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [
      {
        "color": "#f5f1e6"
      }
    ]
  },
  {
    "featureType": "administrative",
    "elementType": "geometry.stroke",
    "stylers": [
      {
        "color": "#c9b2a6"
      }
    ]
  },
  {
    "featureType": "administrative.land_parcel",
    "elementType": "geometry.stroke",
    "stylers": [
      {
        "color": "#dcd2be"
      }
    ]
  },
  {
    "featureType": "administrative.land_parcel",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#ae9e90"
      }
    ]
  },
  {
    "featureType": "landscape.natural",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#dfd2ae"
      }
    ]
  },
  {
    "featureType": "poi",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#dfd2ae"
      }
    ]
  },
  {
    "featureType": "poi",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#93817c"
      }
    ]
  },
  {
    "featureType": "poi.park",
    "elementType": "geometry.fill",
    "stylers": [
      {
        "color": "#a5b076"
      }
    ]
  },
  {
    "featureType": "poi.park",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#447530"
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#f5f1e6"
      }
    ]
  },
  {
    "featureType": "road.arterial",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#fdfcf8"
      }
    ]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#f8c967"
      }
    ]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry.stroke",
    "stylers": [
      {
        "color": "#e9bc62"
      }
    ]
  },
  {
    "featureType": "road.highway.controlled_access",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#e98d58"
      }
    ]
  },
  {
    "featureType": "road.highway.controlled_access",
    "elementType": "geometry.stroke",
    "stylers": [
      {
        "color": "#db8555"
      }
    ]
  },
  {
    "featureType": "road.local",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#806b63"
      }
    ]
  },
  {
    "featureType": "transit.line",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#dfd2ae"
      }
    ]
  },
  {
    "featureType": "transit.line",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#8f7d77"
      }
    ]
  },
  {
    "featureType": "transit.line",
    "elementType": "labels.text.stroke",
    "stylers": [
      {
        "color": "#ebe3cd"
      }
    ]
  },
  {
    "featureType": "transit.station",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#dfd2ae"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "geometry.fill",
    "stylers": [
      {
        "color": "#b9d3c2"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#92998d"
      }
    ]
  }
];

///////////////////////////////////////////////////////////////////////////////
//                        Add-On: Message Pane (Carta)
///////////////////////////////////////////////////////////////////////////////

carta = { };

carta.hide = function(id) {
  var div = document.getElementById(id);
    if (div.style.display === "none") {
        div.style.display = "block";
    } else {
        div.style.display = "none";
    }
};

carta.addMessage = function(text){

};

carta.removeMessage = function(text){

};

carta.changeMessage = function(text){

};

///////////////////////////////////////////////////////////////////////////////
//                        Add-On: D3 Legend Interface
///////////////////////////////////////////////////////////////////////////////

susie = { };

susie.setLegendLinear = function(title=undefined, svgId='svg', domain=[0,1], labels=undefined, cells=2){
  if(labels == null){
    labels = d3.range.apply(this, domain.concat(domain[1]/cells))
    labels = labels.concat(domain[1])
    // transparently adjust our "cells" values to account for taking on a tail
    cells=cells+1
    labels = labels.map(function(e){
      return Number(e.toFixed(2));
    });
  }
  var linear = d3.scaleLinear()
    .domain(domain)
    .range(["rgba(255, 255, 255, 0.0)", "rgba(52, 84, 143, 1)"]);

  var svg = d3.select(svgId);


  svg.append("g")
    .attr("class", "legendLinear")
    .attr("transform", "translate(20,20)")
    .style("font-size","11px")
    .style("font-family","Roboto");

  var legend = d3.legendColor()
    .shapeWidth(20)
    .shapePadding(5)
    .cells(cells)
    .shape("square")
    .orient('horizontal')
    .title(title)
    .titleWidth(300)
    .labelWrap(30)
    .labels(labels)
    .labelAlign("middle")
    .scale(linear);

  svg.select(".legendLinear")
    .call(legend);
}

susie.show = function(id) {

};

susie.hide = function(id) {
  var div = document.getElementById(id);
    if (div.style.display === "none") {
        div.style.display = "block";
    } else {
        div.style.display = "none";
    }
};

susie.toggleEeLayerById = function(id) {
 var checkbox = document.getElementById(id);
 if(checkbox.checked){
   if(id.includes('ist')){
     trendy.App.addLayer(trendy.App.historicalLayer, id='historical');
   } else {
     trendy.App.addLayer(trendy.App.mostRecentLayer, id='mostRecent');
   }
 } else {
   if(id.includes('ist')){
     trendy.App.removeLayer(id='historical');
   } else {
     trendy.App.removeLayer(id='recent');
   }
 }   
};
