/// <reference types="@types/googlemaps" />
const DAYS:Array<string> = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const TODAY:Date = new Date();

// TODO: Legend for hype
// TODO: Sort by hype
// TODO: Sorter by ukedag
// TODO: can't find high DPR? => breaks in chrome for android

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
  // TODO: Filter repeating events pls
  private container: HTMLDivElement;
  private categories: object;
  private togglerList: FilterToggle[];
  private events: CultureEvent[];
  private evts_container: HTMLElement | null;
  private evts_title: HTMLElement | null;

  constructor(categories:object, events: CultureEvent[]) {
    this.container = document.createElement('div');
    this.categories = categories;
    this.togglerList = [];
    this.events = events;
    this.evts_container = document.getElementById('list');
    this.evts_title = document.getElementById('title');
  }

  draw(parent: HTMLElement): void {
    let cont = this.container;
    let categories = this.categories;
    let checkAllEmpty = this.checkAllEmpty;
    let togglerList = this.togglerList;


    // for each category to filter by, create a
    // filtertoggle with the appropriate color
    Object.keys(categories).forEach(cat => {
      let color = (<any> categories)[cat] as string;
      let toggler = new FilterToggle(this.events, cat, color, checkAllEmpty.bind(this));
      togglerList.push(toggler);

      cont.appendChild(toggler.draw());
    });

    cont.classList.add('control');
    parent.appendChild(cont);
    parent.classList.remove('display-none');
  }

  checkAllEmpty(toggler: FilterToggle) {
    if(!this.evts_container || !this.evts_title) return;
    let container = <HTMLDivElement> this.evts_container;
    let title = <HTMLHeadingElement> this.evts_title;

    if (!this.events.reduce((a:boolean, b) =>  a || b.isVisible, false)) {
      // 2: if not all filters are off, but no results: display cute sheep looking for things
      container.classList.add('no-events-found');
      title.classList.add('no-events-found');
    } else {
      container.classList.remove('no-events-found');
      title.classList.remove('no-events-found');
    }

    if(!this.togglerList.reduce((a:boolean, b) => a || b.checked, false)) {
      // 1: if all filters are off, display cute bear struggling with controls
      container.classList.add('no-filters-enabled');
      title.classList.add('no-filters-enabled');
    } else {
      container.classList.remove('no-filters-enabled');
      title.classList.remove('no-filters-enabled');
    }
  }

}

class FilterToggle {
  public checked:boolean;

  private target: string;
  private container: HTMLElement;
  private color: string;
  private name: string;
  private background?: HTMLSpanElement;
  private events: CultureEvent[];
  private alertParent: Function;

  constructor(events: CultureEvent[], target: string, color: string, alertParent: Function) {
    this.events = events;
    this.name = target;
    this.target = target.replace(/\s/g, '-');
    this.color = color;
    this.alertParent = alertParent;

    this.container = document.createElement('div');
    this.checked = false;
  }

  draw(): HTMLElement {
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

  toggle(): (evt: any) => void {
    // closure ensures the scope is correct
    let self = this;

    return function(evt: any) {
      if (self.background) {
        // toggle switches the value of checked
        self.checked = !self.checked;

        // ... then ensures the input element reflects the inner logic
        evt.target.checked = self.checked;

        // then filters list items and map markers
        self.events.filter(evt => evt.category == self.name)
              .forEach(evt => evt.setDisplay(self.checked));

        // alert parent
        self.alertParent(self);

        // ... then colors the background of the toggle switch
        self.background.style.backgroundColor = (self.checked ? self.color : '');
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
  public isVisible: boolean = true;

  private place?: Place;
  private start_time: string;
  private end_time: string;

  private container: HTMLLIElement;
  private marker?:google.maps.Marker;
  private isDrawn: boolean = false;


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
    description = '',
    repeating = ''
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

    } else {
      // if neither, print error
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
    if(this.isDrawn && node) return node.appendChild(this.container);

    // If meta has latlng information, draw the marker there.
    if(!!this.place) {
      this.drawGoogleMarker();
    } else {
      console.error(`Finner ikke stedet "${this.location}" for arrangement "${this.title}" – er stedet stavet riktig? Er stedet registrert riktig?`);
    }

    let li = this.container;
    li.classList.add('event');
    li.id = this.title.trim().replace(/\s/g, '-');


    let sidebar = document.createElement('div');
    sidebar.classList.add('event_sidebar');

    let sb_point = document.createElement('div');
    sb_point.classList.add('event_sidebar-point');
    let scale = (this.hype * 0.2) + 0.4;
    sb_point.style.transform = 'scale3d('+scale+','+scale+',1)';
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

    let marker = this.marker;
    let location = document.createElement('a');

    location.classList.add('location-anchor')
    let place:Place | undefined = this.place;

      location.onclick = function () {
        if(place && place.infowindow && marker) {
        window.scrollTo({left:0, top:0, behavior:'smooth'});

        if(global_infowindow) global_infowindow.close();

        global_infowindow = place.infowindow;
        global_infowindow.open(map, marker);
        map.setCenter(global_infowindow.getPosition());
      }
    }

    location.classList.add('event_details-location');

    if(place && place.navn) {
      location.href = '#_';
      location.textContent = place.navn;
    } else {
      location.classList.add('dead-link')
      location.textContent = this.location;
    }

    details.appendChild(time);
    details.appendChild(location);
    content.appendChild(details);
    li.appendChild(content)

    if (this.description) {
      let p = document.createElement('p');
      p.innerHTML = this.description;
      content.appendChild(p);
    }

    if (node) { node.appendChild(li); }
    this.isDrawn = true;
  }

  setDisplay(visibility:boolean):void {
    this.container.classList.toggle('event_hidden', !visibility);
    if(this.marker) this.marker.setMap(visibility ? map : null);
    this.isVisible = visibility;
  }
}

window.onload = function() {
  let list = <HTMLElement> document.getElementById('list');
  let title = <HTMLElement> document.getElementById('title');

  let parse = parseCSV('\t');

  let eventsURL =   'https://docs.google.com/spreadsheets/d/e/2PACX-1vT3xJC11F5tBLqNYTETN8hAdqBy0OV3vTMt6VjdLLVcvGi_yo0N2fSp8FY9SRFhaI-Pr-FzYnc86Ycj/pub?gid=0&single=true&output=tsv';
  let categoriesURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT3xJC11F5tBLqNYTETN8hAdqBy0OV3vTMt6VjdLLVcvGi_yo0N2fSp8FY9SRFhaI-Pr-FzYnc86Ycj/pub?gid=1573476937&single=true&output=tsv';
  let placesURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT3xJC11F5tBLqNYTETN8hAdqBy0OV3vTMt6VjdLLVcvGi_yo0N2fSp8FY9SRFhaI-Pr-FzYnc86Ycj/pub?gid=606272667&single=true&output=tsv';

  let events = getURL(eventsURL).then(parse);
  let places = getURL(placesURL).then(parse).then(toPlaceList)
  let categories = getURL(categoriesURL).then(parse).then(toCategoryList)

  Promise.all([events, places, categories]).then(promise => {
    let [events_csv, places, categories] = [promise[0], promise[1], promise[2]];

    let meta:Meta = {
      steder: places,
      kategorier:categories
    }

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
          .filter(rows => !!rows[0].trim())
          .map(rows => new CultureEvent(meta, ...rows))
          .filter(evt => evt.repeating || evt.start && evt.start.valueOf() > TODAY.valueOf())
          .sort((a, b) => Math.sign(a.start.valueOf() - b.start.valueOf()));

    // TODO: show only first 40? load more on btn press or scroll?
    events.forEach(evt => evt.draw(list));

    let copyHead = document.getElementById('copy-header');
    if(copyHead) {
      let sortByHypeBtn = document.createElement('button');
      sortByHypeBtn.textContent = 'Sorter etter hype';

      sortByHypeBtn.addEventListener('click', function sortByHype(e) {
        while(list.firstChild) {
          list.removeChild(list.firstChild);
        }
        events.sort((a, b) => Math.sign(b.hype - a.hype));
        events.forEach(evt => evt.draw(list));

        sortByHypeBtn.textContent = 'Sorter etter dato';
        // TODO: sort by date (lol)
      });

      copyHead.appendChild(sortByHypeBtn);
    }

    /* OKAY WE'RE GOOD, TIME FOR INFOWINDOWS */
    Object.keys(meta.steder).forEach(loc => {
      let location = meta.steder[loc];

      location.infowindow = new google.maps.InfoWindow({
        content:
        `<div  class="infowindow">\
          <h4>${location.navn}</h4>\
          <br>\
            ${(<CultureEvent[]> events)
              .filter(e => e.location.toLowerCase() == location.navn.toLowerCase())
              .map(e =>
                `<a\
                onclick="jumpTo('${e.title.trim().replace(/\s/g, '-')}')"
                ><div class="infowindow-point" style="background-color:${e.color}"></div
                >${e.title}</a>`)
              .join('')}\
        </div>`,
        position: {lat:location.lat, lng:location.lng}
      });
    });

    // initialize filter module
    let filterModule: FilterModule = new FilterModule(meta.kategorier, events);
    filterModule.draw(<HTMLElement> document.getElementById('filter'));

    title.textContent = "Kommende arrangementer";
    title.classList.remove('loading');
  })
  .catch((e) => {
    console.error(e);
    title.textContent = 'Kunne ikke laste innhold';
  });

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
    let rows;
    rows = csv.split(/(\r)?\n/gi);
    rows.shift()
    rows = rows.filter(e => e !== undefined).map(row => row.split(delimeter));
    return rows;
  }
}

function toCategoryList(input: string[][]): CategoryList {
  let categoryList:CategoryList = {};
  input.filter(i => !!i[0].trim())
    .forEach(i => categoryList[i[0].replace('"', '')] = i[1])
  return categoryList
}

function toPlaceList(input: string[][]): PlaceList {
  let placeList: PlaceList = {};

  input.filter(i => !!i[0].trim())
    .map(i => {
      return {
        key:i[0],
        place:{
          navn: i[1],
          lat: +i[2],
          lng: +i[3]}
        };
    })
    .forEach(i => placeList[i.key] = i.place)

  return placeList;
}

function jumpTo(evt_id: string) {
  document.location.hash = evt_id;
  let target = document.getElementById(evt_id);
  if(target) {
    window.scrollTo(0,0);
    target.scrollIntoView({ behavior:'smooth', block:'center' });
    // scrollintoview breaks for anything not firefox or chrome
  }
  return target;
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
