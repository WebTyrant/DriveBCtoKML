const express = require('express');
const request = require("request");
const tokml = require('tokml');
const xmldom = require('xmldom');
const XMLSerializer = require('xmldom').XMLSerializer;
const serializer = new XMLSerializer();
const path = require('path');

const app = express();

// map severity levels of events to a color
const severityColors = {
    "MINOR": "#ffff00",
    "MODERATE": "#f5a623",
    "MAJOR": "#ff0000",
};

const options = {
    url: 'http://api.open511.gov.bc.ca/events?format=json&status=ACTIVE&event_type=INCIDENT',
    method: 'GET',
    headers: {
        'Accept': 'application/json',
        'Accept-Charset': 'utf-8',
        'User-Agent': 'DriveBC-511-API-JSON-to-CSV'
    }
};

app.get("/", function (req, res) {
    request(options, function (err, output, body) {
        var json = JSON.parse(body);
        json = json.events;
        
        // restructure DriveBC 511 API JSON to become geoJSON compliant
        const geoJson = driveBCtoGeoJson(json);

        // convert to KML
        var kml = tokml(geoJson, {
            name: 'title',
            description: 'description',
            documentName: 'Drive BC 511 JSON to KML',
            documentDescription: 'A conversion of the Drive BC 511 API JSON to KML by Neil Johnston',
            simplestyle: true
        });
        
        const parser = new xmldom.DOMParser;
        const KMLdoc = parser.parseFromString(kml, 'application/xml');
        const styles = KMLdoc.getElementsByTagName('Style');

        for (var i = 0; i < styles.length; i++) {

            // remove all the childern of the style
            while (styles[i].firstChild) {
                styles[i].removeChild(styles[i].firstChild);
            }

            // create KML color from the hex value in the style id
            var color = styles[i].getAttribute('id').substring(2, 8);
            var KMLcolor = hexToKmlColor(color);
            
            // create the kml icon style node - the easy way
            var iconStyle = parser.parseFromString(
                '<IconStyle>' +
                '<Icon>' +
                '<href>' + req.protocol + '://' + req.get('host') + '/assets/' + color + '.png</href>' + 
                '<color>' + KMLcolor + '</color>' +
                '<scale>1</scale>' +
                '</Icon></IconStyle>' + 
                '<hotSpot xunits="fraction" yunits="fraction" x="0.5" y="0.5"/>', 'text/xml');

            // create the kml line style node
            lineStyle = KMLdoc.createElement('LineStyle');
            lineColor = KMLdoc.createElement('color');
            lineColor.appendChild(KMLdoc.createTextNode(KMLcolor));
            lineWidth = KMLdoc.createElement('width');
            lineWidth.appendChild(KMLdoc.createTextNode('3'));
            lineStyle.appendChild(lineColor);
            lineStyle.appendChild(lineWidth);

            // append line and icon styles
            styles[i].appendChild(lineStyle);
            styles[i].appendChild(iconStyle);
        };
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(serializer.serializeToString(KMLdoc)); //then returning the KML response.
    }); //closing the request function
});

app.get("/geoJson", function (req, res) {
    request(options, function (err, output, body) {
        var json = JSON.parse(body);
        json = json.events;
        
        // restructure DriveBC 511 API JSON to become geoJSON compliant
        const geoJson = driveBCtoGeoJson(json);
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(JSON.stringify(geoJson));
    }); //closing the request function
});

app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.listen(80, () => {
    console.log("DriveBC 511 converter API is running...");
});

function hexToKmlColor(hexColor){
        // hex rrggbb vs kml aabbggrr
    var rr = hexColor.substring(0, 2);
    var gg = hexColor.substring(2, 4);
    var bb = hexColor.substring(4, 6);
    return 'ff' + bb + gg + rr;
};

function driveBCtoGeoJson(json){
    var geoJson = {
            "type": "FeatureCollection",
            "features": [],
        };
    // restructure DriveBC 511 API JSON to become geoJSON compliant
    for (var i = 0; i < json.length; i++) {
        var event = json[i];

        var feature = {
            "type": "Feature"
        };
        feature.properties = event;
        feature.geometry = event.geography;
        delete event.geography;

        // add color properties to the feature JSON
        // Note that tokml's handling of styles is a bit busted, but this will generate the needed ids
        feature.properties["marker-color"] = severityColors[event.severity];
        feature.properties["stroke"] = severityColors[event.severity];
        feature.properties['title'] = event.severity + ' ' + event.headline + ': ' + event.roads[0].name;

        geoJson.features.push(feature);
    };
    return geoJson;
}

module.exports = app;
