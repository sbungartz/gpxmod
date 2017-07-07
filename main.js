"use strict";

var app = angular.module('gpxmod', []);

function downloadXml(filename, data) {
  var blob = new Blob([data], {type: 'application/xml'});
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
  $scope.splitMarkerInterval = 100;

  var color_palette = ['red', 'blue', 'green', 'yellow', 'magenta', 'cyan'];
  var next_color_index = 0;
  var next_track_id = 0;

  function nextColorFromPalette() {
    var color = color_palette[next_color_index];
    next_color_index = (next_color_index + 1) % color_palette.length;
    return color;
  }

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
      trackPosMarker.setLatLng(newSelection.point.latlng).setStyle({color: newSelection.track.color}).addTo(map);
      $scope.selectedPointIndex = newSelection.point.index;
    } else {
      map.removeLayer(trackPosMarker);
    }
  });

  // TODO Workaround for leaflet-gpx bug: actual distance is stored in next point. last point distance should be total track length.
  function getDistanceFromStart(track, index) {
    var data = track.elevationData;
    if(index < data.length - 1) {
      return data[index + 1][0];
    } else {
      return track.distance;
    }
  }

  $scope.$watch('selectedPointIndex', function(newIndex, oldIndex) {
    if(newIndex !== undefined && newIndex >= 0 && $scope.selection) {
      var newLatLng = $scope.selection.track.line.getLatLngs()[newIndex];
      $scope.selection.point = {
        index: newIndex,
        latlng: newLatLng,
        distFromStart: getDistanceFromStart($scope.selection.track, newIndex)
      };
    }
  });

  $scope.addTrackToMap = function(track, onLoaded) {
    var g = new L.GPX(track.gpx, {
      async: true,
      marker_options: {
        startIconUrl: null,
        endIconUrl: null
      },
      polyline_options: {
        color: track.color
      }
    }).on('loaded', function(e) {
      if(e.target.getLayers()[0].getLatLngs == null) {
        alert('oops, that gpx file has more than one sub track or some waypoints or something. not sure i can handle that in this alpha stage...'); 
      }
      if(track.libgpx != null) {
        map.removeLayer(track.libgpx);
      }
      track.libgpx = e.target;
      track.elevationData = track.libgpx.get_elevation_data();
      track.distance = track.libgpx.get_distance() / 1000;
      track.line = track.libgpx.getLayers()[0];
      track.numPoints = track.line.getLatLngs().length;

      if(onLoaded != null) {
        onLoaded(track);
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

  $scope.newGpxTrackLoaded = function(filename, filecontent, zoomToFit) {
    var newTrack = {
      id: next_track_id++,
      name: filename,
      gpx: filecontent,
      color: nextColorFromPalette(),
      marks: {}
    };

    $scope.addTrackToMap(newTrack, function(track) {
      if(zoomToFit) {
        map.fitBounds(track.libgpx.getBounds());
      }
    });

    $scope.tracks.push(newTrack);
    //localStorage.setItem('gpxmod-tracks', JSON.stringify($scope.tracks));
  };

  $scope.removeTrack = function(track) {
    var trackIndex = -1;
    for(var i = 0; i < $scope.tracks.length; i++) {
      if($scope.tracks[i].id === track.id) {
        trackIndex = i;
        break;
      }
    }
    if(trackIndex >= 0) {
      $scope.tracks.splice(trackIndex, 1);
    }
    if($scope.selection && $scope.selection.track.id === track.id) {
      $scope.selection = null;
    }

    for(var markIndex in track.marks) {
      map.removeLayer(track.marks[markIndex].marker);
    }
    map.removeLayer(track.libgpx);
  };

  $scope.addMark = function(track, index) {
    if(track.marks[index] == null) {
      var latlng = track.line.getLatLngs()[index];
      var mark = {
        point: {
          index: index,
          latlng: latlng
        }
      };
      mark.marker = L.circleMarker(latlng, {
        radius: 4,
        color: track.color,
        fillOpacity: 1.0}
      ).on('click', function(e) {
        $scope.selection = {
          track: track,
          point: mark.point
        };
        $scope.$digest();
      }).addTo(map);
      track.marks[index] = mark;
    }
  };

  $scope.removeMark = function(track, index) {
    if(track.marks[index] != null) {
      map.removeLayer(track.marks[index].marker);
      delete track.marks[index];
    }
  };

  $scope.clearMarks = function(track) {
    for(var i in track.marks) {
      $scope.removeMark(track, i);
    }
  };

  function updateMarkIndices(track, calcNewIndex) {
    var marks = [];
    for(var i in track.marks) {
      marks.push(track.marks[i]);
      delete track.marks[i];
    }
    for(var i = 0; i < marks.length; i++) {
      marks[i].point.index = calcNewIndex(marks[i].point.index);
      track.marks[marks[i].point.index] = marks[i];
    }
  }

  function updateSelectedTrackGPX(newGpx, newSelectedPointIndex, onLoaded) {
    $scope.selectedPointIndex = -1;
    $scope.selection.track.gpx = newGpx;
    $scope.addTrackToMap($scope.selection.track, function(track) {
      $scope.selectedPointIndex = newSelectedPointIndex;
      if(onLoaded != null) {
        onLoaded(track);
      }
    });
  }

  function removeNodeWithWhitespace(node) {
    if(node.previousSibling && node.previousSibling.nodeType == Node.TEXT_NODE) {
      node.previousSibling.remove();
    }
    node.remove();
    return node;
  }

  $scope.trimTrack = function(where) {
    var parser = new DOMParser();

    var doc = parser.parseFromString($scope.selection.track.gpx, 'application/xml');
    var trkseg = doc.getElementsByTagName('trkseg')[0];

    if(where === 'before') {
      for(var i = $scope.selection.point.index - 1; i >= 0; i--) {
        removeNodeWithWhitespace(trkseg.children[i]);
        $scope.removeMark($scope.selection.track, i);
      }
      updateMarkIndices($scope.selection.track, function(oldIndex) {
        return oldIndex - $scope.selection.point.index;
      });
      updateSelectedTrackGPX(new XMLSerializer().serializeToString(doc), 0, null);
    } else if(where === 'after') {
      var lenBefore = trkseg.children.length;
      for(var i = trkseg.children.length - 1; i > $scope.selection.point.index; i--) {
        removeNodeWithWhitespace(trkseg.children[i]);
        $scope.removeMark($scope.selection.track, i);
      }
      updateSelectedTrackGPX(new XMLSerializer().serializeToString(doc), $scope.selectedPointIndex, null);
    } else {
      console.log('where must be either before or after, was ' + where);
      return;
    }
  };

  $scope.flipTrack = function() {
    var parser = new DOMParser();
    var doc = parser.parseFromString($scope.selection.track.gpx, 'application/xml');
    var trkseg = doc.getElementsByTagName('trkseg')[0];

    var buffer = [];
    while(trkseg.children.length > 0) {
      buffer.push(removeNodeWithWhitespace(trkseg.children[0]));
    }

    for(var i = buffer.length - 1; i >= 0; i--) {
      trkseg.appendChild(buffer[i]);
    }

    updateMarkIndices($scope.selection.track, function(oldIndex) {
      return buffer.length - 1 - oldIndex;
    });

    var newSelectionIndex = buffer.length - 1 - $scope.selection.point.index;
    updateSelectedTrackGPX(new XMLSerializer().serializeToString(doc), newSelectionIndex, null);
  };

  $scope.mergeTrack = function(direction, other) {
    var parser = new DOMParser();

    var doc = parser.parseFromString($scope.selection.track.gpx, 'application/xml');
    var trkseg = doc.getElementsByTagName('trkseg')[0];

    var trksegOther = parser.parseFromString(other.gpx, 'application/xml').getElementsByTagName('trkseg')[0];

    var newMarkIndices = [];

    if(direction === 'prepend') {
      console.log('not implemented yet');
    } else if(direction === 'append') {
      for(var i = 0; i < trksegOther.children.length; i++) {
        trkseg.appendChild(trksegOther.children[i].cloneNode(true));
        if(other.marks[i] != null) {
          newMarkIndices.push($scope.selection.track.numPoints + i);
        }
      }
    } else {
      console.log('direction must be either prepend or append, was ' + where);
      return;
    }

    $scope.selection.track.name = 'merged.gpx';
    var newSelectionIndex = $scope.selection.point.index;
    updateSelectedTrackGPX(new XMLSerializer().serializeToString(doc), newSelectionIndex, function(track) {
      for(var i = 0; i < newMarkIndices.length; i++) {
        $scope.addMark(track, newMarkIndices[i]);
      }
    });
  };

  $scope.placeRegularMarksOnTrack = function(track) {
    if(track == null){
      return;
    }

    var newInterval = $scope.splitMarkerInterval;
    $scope.clearMarks(track);

    if($scope.splitMarkerInterval == 0) {
      return;
    }

    var m = 1;
    for(var i = 0; i < track.numPoints; i++) {
      if(getDistanceFromStart(track, i) >= m * newInterval) {
        $scope.addMark(track, i);
        m += 1;
      }
    }
  };

  function padWithLeadingZeros(number, maxNumber) {
    var size = maxNumber.toString().length;
    var s = number.toString();
    while (s.length < size) s = "0" + s;
    return s;
  }

  function compareInt(a, b) {
    return a - b;
  }

  $scope.splitTrackAtMarks = function(track) {
    if(track.marks.length == 0) {
      return;
    }

    $scope.removeTrack(track);

    var parser = new DOMParser();
    var serializer = new XMLSerializer();
    var docOrig = parser.parseFromString(track.gpx, 'application/xml');
    var trksegOrig = docOrig.getElementsByTagName('trkseg')[0];

    // First, create a copy of the original document, with an empty trkseg
    var docPlain = docOrig.cloneNode(true);
    var trksegPlain = docPlain.getElementsByTagName('trkseg')[0];
    while(trksegPlain.children.length > 0) {
      removeNodeWithWhitespace(trksegPlain.children[0]);
    }

    var partEnds = [];

    var numParts = 1;
    for(var i in track.marks) {
      numParts++;
      partEnds.push(track.marks[i].point.index);
    }
    partEnds.sort(compareInt);
    partEnds.push(track.numPoints - 1);

    var partNum = 1;
    var nextPartStart = 0;
    for(var partEndIndex = 0; partEndIndex < partEnds.length; partEndIndex++) {
      var partEnd = partEnds[partEndIndex];
      // Now clone the document with cleared trkseg, so we can put the trkpts of this part into it.
      var docPart = docPlain.cloneNode(true);
      var trksegPart = docPart.getElementsByTagName('trkseg')[0];
      for(var i = nextPartStart; i <= partEnd; i++) {
        trksegPart.appendChild(trksegOrig.children[i].cloneNode(true));
      }

      $scope.newGpxTrackLoaded(track.name + '-' + padWithLeadingZeros(partNum, numParts), serializer.serializeToString(docPart), false);

      nextPartStart = partEnd;
      partNum += 1;
    }
  };

  $scope.downloadTrack = function(track) {
    downloadXml(track.name + '.gpx', track.gpx);
  };

  $scope.downloadAllTracks = function() {
    for(var i = 0; i < $scope.tracks.length; i++) {
      $scope.downloadTrack($scope.tracks[i]);
    }
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

          var fileNameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");

          $scope.newGpxTrackLoaded(fileNameWithoutExtension, filecontent, true);
          $scope.$digest();
        }

        reader.readAsText(file);
      });          
    }        
  }
});

app.filter("fixedNumber", function() {
  return function(value, precision) {
    return value.toFixed(precision);
  }
});
