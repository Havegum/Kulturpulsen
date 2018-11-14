/// <reference types="@types/googlemaps" />

const DAYS:Array<string> = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const TODAY:Date = new Date();

let filtered:Array<string> = [];
let map:google.maps.Map;
let global_infowindow:google.maps.InfoWindow | undefined;

interface Place {
    navn:string;
    lat: number;
    lng: number;
    infowindow?: google.maps.InfoWindow;
}

interface PlaceList {
  [key: string]: Place
}

interface CategoryList {
  [kategori: string]: string;
}

interface Meta {
    steder: PlaceList;
    kategorier: CategoryList;
}

class FilterModule {
  private container: HTMLDivElement;
  private categories: object;

  constructor(categories:object) {
    this.container = document.createElement('div');
    this.categories = categories;
  }

  draw(parent: HTMLElement, events: CultureEvent[]): void {
    let cont = this.container;
    let categories = this.categories;


    // for each category to filter by, create a
    // filtertoggle with the appropriate color
    Object.keys(categories).forEach(cat => {
      let color = (<any> categories)[cat] as string;
      let toggler = new FilterToggle(events, cat, color);
      cont.appendChild(toggler.draw());
    });

    cont.classList.add('control');
    parent.appendChild(cont);
    parent.classList.remove('display-none');
  }
}

class FilterToggle {
  private target:string;
  private container: HTMLElement;
  private color:string;
  private name:string;
  private checked:boolean;
  private background?:HTMLSpanElement;
  private events: CultureEvent[];

  constructor(events: CultureEvent[], target:string, color:string) {
    this.events = events;
    this.name = target;
    this.target = target.replace(/\s/g, '-');
    this.color = color;

    this.container = document.createElement('div');
    this.checked = false;
  }

  draw():HTMLElement {
    let cont = this.container;

    let label = document.createElement('label');
    label.htmlFor = this.target + '_toggle';
    label.textContent = this.name + ':';
    cont.appendChild(label);

    let switch_wrap = document.createElement('label');
    switch_wrap.classList.add('switch');
    cont.appendChild(switch_wrap);

    let input = document.createElement('input');
    input.type = 'checkbox';
    input.id = this.target + '_toggle';
    input.addEventListener('change', this.toggle());
    switch_wrap.appendChild(input);

    let slider = document.createElement('span');
    slider.classList.add('slider');
    this.background = slider;
    switch_wrap.appendChild(slider);

    // after building slider: toggle to desired state
    this.toggle()({target:input});

    return cont;
  }

  toggle(): (evt:any) => void {
    // closure ensures the scope is correct
    let self = this;

    return function(evt:any) {
      if (self.background) {
        // toggle switches the value of checked
        self.checked = !self.checked;

        // ... then ensures the input reflects the inner logic
        evt.target.checked = self.checked;

        // then filters list items and map markers
        self.events.filter(evt => evt.category == self.name)
              .filter(evt => evt.hasMarker)
              .forEach(evt => evt.setDisplay(self.checked))

        // ... then colors the background of the toggle switch
        self.background.style.color = (self.checked ? self.color : '');
      }
    }
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
  public hasMarker: boolean;
  public color: string;

  private place?: Place;
  private start_time: string;
  private end_time: string;

  private container: HTMLLIElement;
  private marker?:google.maps.Marker;


  constructor(
    meta:Meta,
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
    this.hasMarker = false;

    this.category = category;
    this.description = description;
    this.hype = +(hype || 0);

    this.container = document.createElement('li');

    this.repeating = false;

    // if string is a date
    if(start_date.match(/\d\d\.\d\d\.\d{4}/)) {
      let d:number[] = start_date.trim().split('.').map(n => +n);
      this.start = new Date(d[2], d[1]-1, d[0]);

    // if string is a day of the week
    } else if(DAYS.indexOf(start_date) > -1) {
      let day:number = DAYS.indexOf(start_date);
      let currentDay:number = (TODAY.getDay() + 5) % 6; // +5%6 makes monday first day

      let dayHasPassed:boolean = day < currentDay;

      this.repeating = true;
      this.repeating_desc = repeating;

      // if day has passed, add 7 subtract the difference
      this.start = new Date(TODAY.getTime() +
        (day - currentDay + (dayHasPassed ? 7 : 0)) * 24*60*60*1000);

    // if neither, print error
    } else {
      this.start = new Date(0);
      console.error(`Arrangementet "${title.trim()}" mangler dato eller ukedag.`)

    }

    this.start_time = start_time;
    this.end_time = end_time;

    this.color = meta.kategorier[this.category.trim()] || '';
    this.place = meta.steder[this.location.trim().toLowerCase()] || undefined;
  }

  private drawGoogleMarker() {
    let marker = new google.maps.Marker({
      position: <google.maps.LatLngLiteral> this.place,
      map: map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        strokeColor: this.color,
        strokeOpacity: .2,
        strokeWeight: 15,
        fillColor: this.color,
        fillOpacity: .8,
        scale: 5 + (this.hype * this.hype / 4)
      }
    });

    this.marker = marker;
    this.hasMarker = true;

    let self = this;
    this.marker.addListener('click', function() {
      if(self.place && self.place.infowindow) {
          if(global_infowindow) global_infowindow.close();
          global_infowindow = self.place.infowindow;
          global_infowindow.open(map, marker);
        }
    });
  }

  draw(node?: HTMLElement | null) {
    // If meta has latlng information, draw the marker there.
    if(!!this.place) {
      this.drawGoogleMarker();
    } else {
      console.error(`finner ikke stedet "${this.location}" for arrangement "${this.title}" – er stedet stavet riktig? Er stedet registrert riktig?`);
    }

    let li = this.container;
    li.classList.add('event');

    let sidebar = document.createElement('div');
    sidebar.classList.add('event_sidebar');

    let sb_point = document.createElement('div');
    sb_point.classList.add('event_sidebar-point');
    sb_point.style.backgroundColor = this.color;

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
        DAYS[(this.start.getDay()+5)%6] + ' ' +
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

  setDisplay(visibility:boolean):void {
    this.container.classList.toggle('event_hidden', !visibility);
    if(this.marker) this.marker.setMap(visibility ? map : null);
  }
}


window.onload = function() {
  let list = document.getElementById('list');
  let title = <HTMLElement> document.getElementById('title');

  let meta = getURL('./meta.json').then(JSON.parse).then(meta => meta as Meta);
  let events = getURL('./events.csv').then(parseCSV(';'));

  Promise.all([meta, events]).then(promise => {
    let [meta, events_csv] = [promise[0], promise[1]];


      /* LETS GET EVENTS UP AND RUNNING

        The following block does this:
          for each row:
            filter rows with empty title
            map to CultureEvent
            filter invalid dates
            sort by date
            draw
      */
      let events = events_csv
            .filter(rows => !!rows[0])
            .map(rows => new CultureEvent(meta, ...rows))
            .filter(evt => evt.repeating || evt.start && evt.start.valueOf() > TODAY.valueOf())
            .sort((a, b) => Math.sign(a.start.valueOf() - b.start.valueOf()));
      events.forEach(evt => evt.draw(list));


      /* OKAY WE'RE GOOD, TIME FOR META STUFF */

    Object.keys(meta.steder).forEach(loc => {
      let location = meta.steder[loc];

      location.infowindow = new google.maps.InfoWindow({
        content:
        `<div  class="infowindow">\
          <h4>${location.navn}</h4>\
          <br>\
          <p>
            ${(<CultureEvent[]> events)
              .filter(e => e.location.toLowerCase() == location.navn.toLowerCase())
              .map(e => `<div class="infowindow-point" style="background-color:${e.color}"></div>${e.title}`)
              .join('<br>')}\
          </p>
        </div>`,
        position: {lat:location.lat, lng:location.lng}
      });
      // TODO: Anchors that point to the event

    });

    // initialize filter module
    let filterModule: FilterModule = new FilterModule(meta.kategorier);
    filterModule.draw(<HTMLElement> document.getElementById('filter'), events);


    title.textContent = "Kommende arrangementer";
    title.classList.remove('loading');
  })
  .catch(() => title.textContent = 'Kunne ikke laste innhold');

  // initialize map
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
}
