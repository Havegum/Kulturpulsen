/// <reference types="@types/googlemaps" />

const DAYS:Array<string> = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const TODAY:Date = new Date();


let meta: Promise<any>;
let map:google.maps.Map;
let markers:google.maps.Marker[] = [];

class FilterModule {
  private container: DocumentFragment;

  constructor() {
    this.container = document.createDocumentFragment();
  }

  draw(parent: HTMLElement | null): void {
    let cont = this.container;

    let controls = document.createElement('div');
    controls.classList.add('controls');

    let title = document.createElement('h2');
    title.textContent = 'Filtrer arrangementer';

    let hide_btn = document.createElement('div');
    hide_btn.classList.add('hide_button');

    controls.appendChild(title);
    controls.appendChild(hide_btn);
    cont.appendChild(controls);

    (<HTMLElement> parent).appendChild(cont);
    (<HTMLElement> parent).appendChild(document.createElement('ul'));

  }
}

class CultureEvent {
  public category: string;
  public title: string;
  public location: string;
  public hype: number;
  public start: Date;
  public repeating_desc?: string;
  public repeating: boolean;
  public description: string;

  private latlng?: google.maps.LatLngLiteral;
  private color: string;
  private start_time: string;
  private end_time: string;

  private container: HTMLLIElement;


  constructor(
    title = '',
    location = '',
    start_date = '',
    start_time = '',
    end_date = '',
    end_time = '',
    category = '',
    hype = '',
    repeating = '',
    description = ''
  ) {
    this.title = title;
    this.location = location;

    this.category = category;
    this.description = description;
    this.hype = +(hype || 0);

    this.container = document.createElement('li');

    this.repeating = false;

    // string is a date
    if(start_date.match(/\d\d\.\d\d\.\d{4}/)) {
      let d:number[] = start_date.trim().split('.').map(n => +n);
      this.start = new Date(d[2], d[1]-1, d[0]);

    // string is a day of the week
    } else if(DAYS.indexOf(start_date) > -1) {
      let day:number = DAYS.indexOf(start_date);
      let currentDay:number = (TODAY.getDay() + 5) % 6; // +5%6 makes monday first day

      let dayHasPassed:boolean = day < currentDay;

      // if day has passed, add 7 subtract the difference
      this.start = new Date(TODAY.getTime() +
        (day - currentDay + (dayHasPassed ? 7 : 0)) * 24*60*60*1000);

    } else {
      this.start = TODAY;
      this.repeating = true;
      this.repeating_desc = repeating;

    }

    this.start_time = start_time;
    this.end_time = end_time;

    this.color = '';

    meta.then(meta => {
      if(!!meta.steder[this.location.trim().toLowerCase()])
        this.latlng = meta.steder[this.location.trim().toLowerCase()];

      if(!!meta.kategorier[this.category.trim()])
        this.color = meta.kategorier[this.category.trim()];
    });
  }

  private drawGoogleMarker() {
    let circle = new google.maps.Marker({
      position: <google.maps.LatLngLiteral> this.latlng,
      map:map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        strokeColor: this.color,
        strokeOpacity: .2,
        strokeWeight: 15,
        fillColor: this.color,
        fillOpacity: .8,
        scale: 5 + (this.hype * this.hype/4)
      }
    });
    markers.push(circle);
  }

  draw(node?: HTMLElement | null) {
    meta.then(meta => {
      if(!!this.latlng) this.drawGoogleMarker();
    });

    let li = this.container;
    li.classList.add('event');


    let sidebar = document.createElement('div');
    sidebar.classList.add('event_sidebar');

    let sb_point = document.createElement('div');
    sb_point.classList.add('event_sidebar-point');
    meta.then(json =>
      sb_point.style.backgroundColor = json.kategorier[this.category]);

    let sb_repeat = document.createElement('div');
    sb_repeat.classList.add('event_sidebar-repeating-points')

    sidebar.appendChild(sb_point);
    sidebar.appendChild(sb_repeat);
    li.appendChild(sidebar);

    let content = document.createElement('div');
    sb_repeat.classList.add('event_content');

    let title = document.createElement('h2');
    title.textContent = this.title;
    content.appendChild(title);

    let details = document.createElement('div');
    details.classList.add('event_details');

    let time = document.createElement('span');
    time.classList.add('event_details-time');
    time.textContent =
        DAYS[this.start.getDay()] + ' ' +
        this.start.getDate() + '. ' +
        this.start.toLocaleString('nb-NO', {month:'long'}) + ' ' +
        this.start_time + (!this.end_time ? '' : '–' +
        this.end_time);

    let location = document.createElement('span');
    location.classList.add('event_details-location');
    location.textContent = this.location;

    details.appendChild(time);
    details.appendChild(location);
    content.appendChild(details);
    li.appendChild(content)

    if (this.description) {
      let p = document.createElement('p');
      p.textContent = this.description;
      content.appendChild(p);
    }

    if (node) { node.appendChild(li); }
  }
}


window.onload = function() {
  let list = document.getElementById('list');
  let title = <HTMLElement> document.getElementById('title');

  meta = getURL('./meta.json')
    .then(JSON.parse)
    .catch(() => title.textContent = 'Kunne ikke laste innhold');


  /*
    The following block does this:
      get the url using XMLHttpRequest
      parse semicolon-delimetered csv
      for each row:
        filter rows with empty title
        map to CultureEvent
        filter invalid dates
        sort by date
        draw
  */
  getURL('./events.csv')
    .then(parseCSV(';'))
    .then((events: Array<Array<string>>) =>
        events
            .filter(rows => !!rows[0])
            .map(rows => new CultureEvent(...rows))
            .filter(evt => evt.repeating || evt.start.valueOf() > TODAY.valueOf())
            .sort((a, b) => Math.sign(a.start.valueOf() - b.start.valueOf()))
            .forEach(evt => evt.draw(list)))

      .then(() => { title.textContent = "Kommende arrangementer"; title.classList.remove('loading'); })
      .catch(() => title.textContent = 'Kunne ikke laste innhold');

  initMap();
}


function getURL(url: string): Promise<any> {
  return new Promise(function(resolve, reject) {
    let xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 4) {
        if (xhr.status == 200) {
          resolve(xhr.responseText);
        } else {
          reject(xhr.status + ' ' + xhr.statusText);
        }
      }
    }
    xhr.send(null);
  });
}

function parseCSV(delimeter: string) {
  return function(csv: string) {
    let rows = csv.split(/\r\n/gi).slice(1, -1);
    return rows.map(row => row.split(delimeter));
  }
}


function initMap() {
  var bergen = { lat: 60.390711, lng: 5.323165 };

  var styledMapType = new google.maps.StyledMapType([
    {
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#242f3e"
        }
      ]
    },
    {
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#746855"
        }
      ]
    },
    {
      "elementType": "labels.text.stroke",
      "stylers": [
        {
          "color": "#242f3e"
        }
      ]
    },
    {
      "featureType": "administrative",
      "elementType": "geometry",
      "stylers": [
        {
          "visibility": "off"
        }
      ]
    },
    {
      "featureType": "administrative.locality",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#d59563"
        }
      ]
    },
    {
      "featureType": "administrative.neighborhood",
      "stylers": [
        {
          "visibility": "off"
        }
      ]
    },
    {
      "featureType": "landscape.natural",
      "elementType": "geometry.fill",
      "stylers": [
        {
          "color": "#263c35"
        },
        {
          "visibility": "on"
        }
      ]
    },
    {
      "featureType": "poi",
      "stylers": [
        {
          "visibility": "off"
        }
      ]
    },
    {
      "featureType": "poi.park",
      "elementType": "geometry.fill",
      "stylers": [
        {
          "color": "#27493f"
        },
        {
          "visibility": "on"
        }
      ]
    },
    {
      "featureType": "poi.school",
      "stylers": [
        {
          "visibility": "on"
        }
      ]
    },
    {
      "featureType": "road",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#38414e"
        }
      ]
    },
    {
      "featureType": "road",
      "elementType": "geometry.stroke",
      "stylers": [
        {
          "color": "#212a37"
        }
      ]
    },
    {
      "featureType": "road",
      "elementType": "labels.icon",
      "stylers": [
        {
          "visibility": "off"
        }
      ]
    },
    {
      "featureType": "transit",
      "stylers": [
        {
          "visibility": "off"
        }
      ]
    },
    {
      "featureType": "transit.line",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#7c3434"
        },
        {
          "visibility": "on"
        },
        {
          "weight": 2
        }
      ]
    },
    {
      "featureType": "water",
      "elementType": "geometry",
      "stylers": [
        {
          "color": "#17263c"
        }
      ]
    },
    {
      "featureType": "water",
      "elementType": "labels.text",
      "stylers": [
        {
          "visibility": "off"
        }
      ]
    },
    {
      "featureType": "water",
      "elementType": "labels.text.fill",
      "stylers": [
        {
          "color": "#515c6d"
        }
      ]
    },
    {
      "featureType": "water",
      "elementType": "labels.text.stroke",
      "stylers": [
        {
          "color": "#17263c"
        }
      ]
    }
  ],
    { name: 'Styled Map' });

  map = new google.maps.Map(
    document.getElementById('map'), {
      zoom: 14,
      center: bergen,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    });

  map.mapTypes.set('styled_map', styledMapType);
  map.setMapTypeId('styled_map');

  let filterModule: FilterModule = new FilterModule();
  filterModule.draw(document.getElementById('filter'));

}
