"use strict";

var app = angular.module('gpxmod', []);

function downloadXml(filename, data) {
  var blob = new Blob([data], {type: 'text/xml'});
  if(window.navigator.msSaveOrOpenBlob) {
    window.navigator.msSaveBlob(blob, filename);
  }
  else{
    var elem = window.document.createElement('a');
    elem.href = window.URL.createObjectURL(blob);
    elem.download = filename;        
    document.body.appendChild(elem);
    elem.click();        
    document.body.removeChild(elem);
    window.URL.revokeObjectURL(elem.href);
  }
}

app.controller('TrackController', function($scope) {
  var color_palette = ['red', 'blue', 'green', 'yellow', 'magenta', 'cyan'];
  $scope.color_palette = color_palette;

  var trackLayers = {};

  var trackPosMarker = L.circleMarker([0, 0], { radius: 7 });

  var map = L.map('mapid').setView([0, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'Map data &copy; 2013 OpenStreetMap contributors'
      }).addTo(map);

  // No localStorage for now...
  //function loadFromStorage(key, defaultValue) {
  //  var value = localStorage.getItem('gpxmod-tracks');
  //  return (value && JSON.parse(value)) || defaultValue;
  //}

  //$scope.tracks = loadFromStorage('gpxmod-tracks', []);
  $scope.tracks = [];

  function findClosestPoint(ps, p) {
    var closestIndex = -1;
    var closestPoint = null;
    var closestDistance = Infinity;
    for(var i = 0; i < ps.length; i++) {
      var distance = ps[i].distanceTo(p);
      if(distance < closestDistance) {
        closestIndex = i;
        closestPoint = ps[i];
        closestDistance = distance;
      }
    }

    return {
      index: closestIndex,
      latlng: closestPoint,
    };
  }

  $scope.$watchCollection('selection', function(newSelection, oldSelection) {
    if(newSelection && newSelection.point.latlng) {
      trackPosMarker.setLatLng(newSelection.point.latlng).setStyle({color: trackLayers[newSelection.track.index].options.color}).addTo(map);
      $scope.selectedPointIndex = newSelection.point.index;
    }
  });

  // TODO Workaround for leaflet-gpx bug: actual distance is stored in next point. last point distance should be total track length.
  function getDistanceFromStart(track, index) {
    var data = track.libgpx.get_elevation_data();
    if(index < data.length - 1) {
      return data[index + 1][0];
    } else {
      return track.distance / 1000;
    }
  }

  $scope.$watch('selectedPointIndex', function(newIndex, oldIndex) {
    if(newIndex !== undefined && newIndex >= 0 && $scope.selection) {
      var newLatLng = trackLayers[$scope.selection.track.index].getLatLngs()[newIndex];
      $scope.selection.point = {
        index: newIndex,
        latlng: newLatLng,
        distFromStart: getDistanceFromStart($scope.selection.track, newIndex)
      };
    }
  });

  $scope.addTrackToMap = function(track, focusTrack, selectedPointIndex) {
    var g = new L.GPX(track.gpx, {
      async: true,
      marker_options: {
        startIconUrl: null,
        endIconUrl: null
      },
      polyline_options: {
        color: color_palette[track.index % color_palette.length]
      }
    }).on('loaded', function(e) {
      if(e.target.getLayers().length > 1) {
        alert('oops, that gpx file has more than one sub track or some waypoints or something. not sure i can handle that in this alpha stage...'); 
      }
      track.libgpx = e.target;
      track.distance = track.libgpx.get_distance();
      track.numPoints = track.libgpx.getLayers()[0].getLatLngs().length;
      if(trackLayers[track.index]) {
        map.removeLayer(trackLayers[track.index]);
      }
      trackLayers[track.index] = e.target.getLayers()[0];
      if(focusTrack) {
        map.fitBounds(e.target.getBounds());
      }
      if(selectedPointIndex !== null) {
        $scope.selectedPointIndex = selectedPointIndex;
      }
      $scope.$digest();
    }).addTo(map)
    .on('click', function(e) {
      var point = findClosestPoint(e.layer.getLatLngs(), e.latlng);
      $scope.selection = {
        track: track,
        point: point
      };
      $scope.$digest();
    });
  };

  for(var i = 0; i < $scope.tracks.length; i++) {
    $scope.addTrackToMap($scope.tracks[i], true, null);
  }

  $scope.newGpxTrackLoaded = function(filename, filecontent) {
    var newTrack = {
      name: filename,
      gpx: filecontent,
      index: $scope.tracks.length
    };

    $scope.addTrackToMap(newTrack, true, null);

    $scope.tracks.push(newTrack);
    //localStorage.setItem('gpxmod-tracks', JSON.stringify($scope.tracks));

    $scope.$digest();
  };

  $scope.trimTrack = function(where) {
    var parser = new DOMParser();

    var doc = parser.parseFromString($scope.selection.track.gpx, 'text/xml');
    var trkseg = doc.getElementsByTagName('trkseg')[0];

    if(where === 'before') {
      for(var i = 0; i < $scope.selection.point.index; i++) {
        trkseg.removeChild(trkseg.children[0]);
      }
      $scope.selectedPointIndex = -1;
      $scope.selection.track.gpx = new XMLSerializer().serializeToString(doc);
      $scope.addTrackToMap($scope.selection.track, false, 0);
    } else if(where === 'after') {
      var lenBefore = trkseg.children.length;
      for(var i = $scope.selection.point.index + 1; i < lenBefore; i++) {
        trkseg.removeChild(trkseg.children[$scope.selection.point.index + 1]);
      }
      $scope.selection.track.gpx = new XMLSerializer().serializeToString(doc);
      $scope.addTrackToMap($scope.selection.track, false, $scope.selectedPointIndex);
      $scope.selectedPointIndex = -1;
    } else {
      console.log('where must be either before or after, was ' + where);
      return;
    }
  };

  $scope.flipTrack = function() {
    var parser = new DOMParser();
    doc = parser.parseFromString($scope.selection.track.gpx, 'text/xml');
    var trkseg = doc.getElementsByTagName('trkseg')[0];

    var buffer = [];
    while(trkseg.children.length > 0) {
      buffer.push(trkseg.removeChild(trkseg.children[0]));
    }

    for(var i = buffer.length - 1; i >= 0; i--) {
      trkseg.appendChild(buffer[i]);
    }

    var newSelectionIndex = buffer.length - 1 - $scope.selection.point.index;
    $scope.selectedPointIndex = -1;
    $scope.selection.track.gpx = new XMLSerializer().serializeToString(doc);
    $scope.addTrackToMap($scope.selection.track, false, newSelectionIndex);
  };

  $scope.mergeTrack = function(direction, other) {
    var parser = new DOMParser();

    var doc = parser.parseFromString($scope.selection.track.gpx, 'text/xml');
    var trkseg = doc.getElementsByTagName('trkseg')[0];

    var trksegOther = parser.parseFromString(other.gpx, 'text/xml').getElementsByTagName('trkseg')[0];

    if(direction === 'prepend') {
      console.log('not implemented yet');
    } else if(direction === 'append') {
      for(var i = 0; i < trksegOther.children.length; i++) {
        trkseg.appendChild(trksegOther.children[i].cloneNode(true));
      }
    } else {
      console.log('direction must be either prepend or append, was ' + where);
      return;
    }

    var selectionIndex = $scope.selection.point.index;
    $scope.selectedPointIndex = -1;
    $scope.selection.track.name = 'merged.gpx';
    $scope.selection.track.gpx = new XMLSerializer().serializeToString(doc);
    $scope.addTrackToMap($scope.selection.track, false, selectionIndex);
  };

  $scope.downloadTrack = function(track) {
    downloadXml(track.name, track.gpx);
  };
});

app.directive("gpxTrackUpload",function(){    
  return {
    restrict: 'A',
    link: function($scope,el){          
      el.bind("change", function(evt){          
        if(!window.FileReader) return; // Browser is not compatible

        var reader = new FileReader();

        var file = evt.target.files[0];

        reader.onload = function(evt) {
          if(evt.target.readyState != 2) return;
          if(evt.target.error) {
            alert('Error while reading file');
            return;
          }

          var filecontent = evt.target.result;

          $scope.newGpxTrackLoaded(file.name, filecontent);
        }

        reader.readAsText(file);
      });          
    }        
  }
});
