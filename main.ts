/// <reference types="@types/googlemaps" />
const DAYS:Array<string> = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const TODAY:Date = new Date();
const DATEBOUNDARY: Date = getDateBoundary(TODAY);

let filtered:Array<string> = [];
let map:google.maps.Map;
let global_infowindow:google.maps.InfoWindow | undefined;

interface Place {
    navn: string;
    lat: number;
    lng: number;
    address?: string;
    website?: string;
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

interface ListElement {
  start: Date;
  getBody: () => HTMLElement;
}

class FilterModule {
  private container: HTMLDivElement;
  private categories: object;
  private togglerList: FilterToggle[];
  private events: CultureEvent[];
  private evts_container: HTMLElement;
  private evts_header: HTMLElement;

  constructor (
    categories:object,
    events: CultureEvent[],
    evts_container:HTMLElement,
    evts_header:HTMLElement
  ) {
    this.container = document.createElement('div');
    this.categories = categories;
    this.togglerList = [];
    this.events = events;
    this.evts_container = evts_container;
    this.evts_header = evts_header;
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

  checkAllEmpty(/*toggler: FilterToggle*/) {
    let container = this.evts_container;
    let evts_header = this.evts_header;

    if (!this.events.reduce((a:boolean, b) =>  a || b.isVisible, false)) {
      // 2: if not all filters are off, but no results: display cute sheep looking for things
      container.classList.add('no-events-found');
      evts_header.classList.add('no-events-found');
    } else {
      container.classList.remove('no-events-found');
      evts_header.classList.remove('no-events-found');
    }

    if(!this.togglerList.reduce((a:boolean, b) => a || b.checked, false)) {
      // 1: if all filters are off, display cute bear struggling with controls
      container.classList.add('no-filters-enabled');
      evts_header.classList.add('no-filters-enabled');
    } else {
      container.classList.remove('no-filters-enabled');
      evts_header.classList.remove('no-filters-enabled');
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
  private website: string;
  private locale: string;
  private start_time: string;
  private end?: Date;
  private end_time: string;
  private infowindowElement?: HTMLElement;

  private marker?:google.maps.Marker;
  private container: HTMLLIElement;
  private isDrawn: boolean = false;


  constructor(
    meta:Meta,
    title = '',
    location = '',
    locale = '',
    start_date = '',
    start_time = '',
    end_date = '',
    end_time = '',
    category = '',
    hype = '',
    description = '',
    website = '',
    repeating = ''
  ) {
    this.title = title;
    this.website = website;
    this.location = location;
    this.locale = locale;
    this.hasMarker = false;

    this.category = category;
    this.description = description;
    this.hype = +(hype || 1);

    this.container = document.createElement('li');

    this.repeating = false;

    // if string is a date
    if(start_date.match(/\d\d\.\d\d\.\d{4}/)) {
      let d:number[] = start_date.trim().split('.').map(n => +n);
      this.start = new Date(d[2], d[1]-1, d[0]);
    // if string is a day of the week
    } else if(DAYS.indexOf(start_date) > -1) {
      let day:number = DAYS.indexOf(start_date);
      let currentDay:number = (TODAY.getDay() + 6) % 7; // +6%7 makes monday first day

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

    if(start_time) {
      this.start.setHours(+start_time.split(':')[0]);
      this.start.setMinutes(+start_time.split(':')[1]);
    } else {
      this.start.setHours(18);
      this.start.setMinutes(0);
    }

    this.start_time = start_time;

    if(end_date && end_date.valueOf() > start_date.valueOf() ) {
      let d:number[] = start_date.trim().split('.').map(n => +n);
      this.end = new Date(d[2], d[1]-1, d[0]);
      if(end_time) {
        this.end.setHours(+end_time.split(':')[0]);
        this.end.setMinutes(+end_time.split(':')[1]);
      }
    }
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
        scale: 5 + (this.hype * this.hype / 2)
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

  getBody () {
    if(this.isDrawn) return this.container;

    // If meta has latlng information, draw the marker there.
    if(!!this.place) {
      this.drawGoogleMarker();
    } else {
      console.error(`Finner ikke stedet "${this.location}" for arrangement "${this.title}" – er stedet stavet riktig? Er stedet registrert riktig?`);
    }

    let li = this.container;
    li.classList.add('event');
    let id = this.title.trim().replace(/\s/g, '-');
    li.id = id;

    li.addEventListener('click', () => {
      let currentScrollTop = document.documentElement.scrollTop || document.body.scrollTop;
      document.location.hash = '#' + id;
      window.scrollTo({left:0, top:currentScrollTop});
    }, true);

    let sidebar = document.createElement('div');
    sidebar.classList.add('event_sidebar');

    let sb_point = document.createElement('div');
    sb_point.classList.add('event_sidebar-point');
    let scale = 0.9;

    if(this.hype >= 3) {
      scale = 1.7;
      sb_point.classList.add('event_fave-point');
    } else if(this.hype == 2) {
      scale = 1.4;
    }

    sb_point.style.transform = 'scale3d('+scale+','+scale+',1)';
    sb_point.style.backgroundColor = this.color;

    let sb_repeat = document.createElement('div');
    sb_repeat.classList.add('event_sidebar-repeating-points')

    sidebar.appendChild(sb_point);
    sidebar.appendChild(sb_repeat);
    li.appendChild(sidebar);

    let content = document.createElement('div');
    sb_repeat.classList.add('event_content');

    let title_link = document.createElement('a');
    title_link.classList.add('event-title');
    let title = document.createElement('h2');
    title.textContent = this.title;
    title_link.setAttribute('style', 'text-decoration-color:' + this.color);

    if(this.website) {
      title_link.href = this.website;
      title_link.target = '_blank';
      title_link.classList.add('website');
    }

    title_link.appendChild(title);
    content.appendChild(title_link);

    let details = document.createElement('div');
    details.classList.add('event_details');

    let time = document.createElement('span');
    time.classList.add('event_details-time');
    time.textContent =
        DAYS[(this.start.getDay()+6)%7] + ' ' +
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
      location.textContent = place.navn + (this.locale ? ' – ' + this.locale : '');
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

    this.isDrawn = true;
    return li;
  }

  appendTo(el: HTMLElement) {
    el.appendChild(this.container);
  }

  createInfowindowElement():HTMLElement {
    if(this.infowindowElement) return this.infowindowElement;
    let ul = document.createElement('li');

    let a = document.createElement('a');
    a.setAttribute('onclick', 'jumpTo("' + this.title.trim().replace(/\s/g, '-') + '");');

    let point = document.createElement('div');
    point.classList.add('infowindow-point');
    point.style.backgroundColor = this.color;

    let txt = document.createElement('p');
    txt.textContent = this.title;

    a.appendChild(point);
    a.appendChild(txt)
    ul.appendChild(a);

    this.infowindowElement = ul;
    return ul;
  }

  setDisplay (visibility:boolean):void {
    this.container.classList.toggle('event_hidden', !visibility);
    if(this.marker) this.marker.setMap(visibility ? map : null);
    if(this.infowindowElement) this.infowindowElement.style.display = visibility ? '' : 'none';
    this.isVisible = visibility;
  }
}

class ListSeperator {
  public start: Date;

  private label: string;
  private body: HTMLLIElement;
  private isDrawn: boolean;
  private weekly: boolean;

  constructor (
    start: Date,
    label?: string
  ) {
    start.setHours(0);
    start.setMinutes(0);
    this.start = new Date(start.valueOf() - 1);
    if(label) {
      this.label = label;
      this.weekly = true;
    } else {
      this.label = start.toLocaleString('nb-NO', {month:'long'});
      this.weekly = false;
    }
    this.body = document.createElement('li');
    this.isDrawn = false;
  }

  getBody () {
    if(this.isDrawn) return this.body;

    this.body.classList.add('list-seperator', 'noselect');
    if(this.weekly) this.body.classList.add('weekly');
    this.body.textContent = this.label;

    this.isDrawn = true;
    return this.body;
  }

  appendTo (el:HTMLElement) {
    el.appendChild(this.body);
  }
}

window.onload = function() {
  let listOrNull = document.getElementById('list');
  if(listOrNull === null) throw new Error('HTML error! #list not found');
  let list = <HTMLElement> listOrNull;

  let titleOrNull = document.getElementById('title');
  if(listOrNull === null) throw new Error('HTML error! #title not found');
  let title = <HTMLElement> titleOrNull;

  let copyHeadOrNull = document.getElementById('copy-header');
  if(copyHeadOrNull === null) throw new Error('HTML error! #copy-header not found');
  let copyHead = document.createElement('div');
  copyHead.classList.add('copy-head-content');
  (<HTMLElement> copyHeadOrNull).appendChild(copyHead);

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
          .filter(evt => evt.repeating || evt.start && evt.start.valueOf() > TODAY.valueOf());

    let seperators = getMonthSeparators(TODAY, DATEBOUNDARY).concat(getWeeks(TODAY, DATEBOUNDARY));

    // IDEA: show only first 40? load more on btn press or scroll?
    (<ListElement[]> events)
      .concat(seperators)
      // .map(e => {console.log(e); return e})
      .sort((a, b) => Math.sign(a.start.valueOf() - b.start.valueOf()))
      .map(evt => evt.getBody())
      .forEach(e => list.appendChild(e));

    /* OKAY WE'RE GOOD, TIME FOR INFOWINDOWS */
    Object.keys(meta.steder).forEach(loc => {
      let location = meta.steder[loc];

      let div = document.createElement('div');
      div.classList.add('infowindow');

      let infowindow_title_a = document.createElement('a');
      let infowindow_title = document.createElement('h4');
      infowindow_title.textContent = location.navn;
      infowindow_title_a.appendChild(infowindow_title);
      div.appendChild(infowindow_title_a);

      if(location.address) {
        let adr = document.createElement('p');
        adr.textContent = location.address;
        div.appendChild(adr);
      }

      if(location.website) infowindow_title_a.href = location.website;

      let eventList = document.createElement('ul');
      div.appendChild(eventList);

      events
        .filter(e => e.location.toLowerCase() == loc)
        .map(e => e.createInfowindowElement())
        .forEach(infoWindow => eventList.appendChild(infoWindow));

      location.infowindow = new google.maps.InfoWindow({
        content:div,
        position: {lat:location.lat, lng:location.lng}
      });
    });

    // OKAY so far so good, time to do the header
    // Heres the button thing that sort events by date or hype!
    let sortBtn = document.createElement('button');
    let sortByHype = true;
    sortBtn.textContent = 'Sorter etter våre favoritter';
    sortBtn.classList.add('sort-by-fav');

    sortBtn.addEventListener('click', () => {
      while(list.firstChild) {
        list.removeChild(list.firstChild);
      }

      let toDraw:any[];
      if(sortByHype) {
        toDraw = events.sort((a, b) => Math.sign(b.hype - a.hype));
        // TODO: sort by hype THEN date

        sortBtn.textContent = 'Sorter etter dato';
        sortBtn.classList.add('sort-by-date');
        sortBtn.classList.remove('sort-by-fav');

      } else {

        toDraw = (<ListElement[]> events).concat(seperators)
          .sort((a, b) => Math.sign(a.start.valueOf() - b.start.valueOf()));

        sortBtn.textContent = 'Sorter etter våre favoritter';
        sortBtn.classList.add('sort-by-fav');
        sortBtn.classList.remove('sort-by-date');
      }

      sortByHype = !sortByHype;
      toDraw.map(evt => evt.getBody()).forEach(e => list.appendChild(e));
    });
    copyHead.appendChild(sortBtn);

    // HYPE Legend
    let hypeLegend = document.createElement('div');
    hypeLegend.classList.add('hype-legend', 'noselect');

    let arrangementer = document.createElement('p');
    arrangementer.textContent = 'Arrangementer —'
    hypeLegend.appendChild(arrangementer);

    let a1_e = document.createElement('div');
    a1_e.classList.add('event_sidebar-point');
    a1_e.style.margin = '0 0.2em';

    let a2_e = <HTMLElement> a1_e.cloneNode(true);
    let fav_e = <HTMLElement> a1_e.cloneNode(true);

    a2_e.style.transform = 'scale3d(1.4,1.4,1)';

    hypeLegend.appendChild(a1_e);
    hypeLegend.appendChild(a2_e);

    let faves = document.createElement('p');
    faves.textContent = 'Vi ser spesielt frem til disse —'
    hypeLegend.appendChild(faves);
    fav_e.classList.add('event_fave-point');
    fav_e.style.margin = '0 0 0 0.8em';
    fav_e.style.transform = 'scale3d(1.8,1.8,1)';

    hypeLegend.appendChild(fav_e);
    copyHead.appendChild(hypeLegend);

    // initialize filter module
    let filterModule: FilterModule = new FilterModule(
      meta.kategorier,
      events,
      <HTMLElement> document.getElementById('list'),
      <HTMLElement> document.getElementById('copy-header')
    );

    let filterElem = <HTMLElement> document.getElementById('filter');
    filterModule.draw(filterElem);

    let hiddenFilter = false;
    let hideFilterBtn = <HTMLElement> document.getElementById('hide-filter');
    hideFilterBtn.addEventListener('click', function () {
      hiddenFilter = !hiddenFilter;

      if(hiddenFilter) {
        filterElem.classList.add('filter-hidden', 'filter-hide-children');
        hideFilterBtn.firstElementChild!.textContent = 'Filter';
      } else {
        filterElem.classList.remove('filter-hidden');
        setTimeout(() => hiddenFilter ? null: filterElem.classList.remove('filter-hide-children'), 200)
        hideFilterBtn.firstElementChild!.textContent = 'Skjul';
      }

      setTimeout(() => { hideFilterBtn.blur(); document.body.focus() }, 200)
    })

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

function getURL(url: string, options?: any): Promise<any> {
  return new Promise(function(resolve, reject) {
    let xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    if(options) {
      if(options.overrideMimeType) xhr.overrideMimeType(options.overrideMimeType);
    }
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 4) {
        if (xhr.status == 200) {
          if(options && options.responseType === 'XML') resolve(xhr.responseXML);

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
        key: i[0].toLowerCase(),
        place: {
          navn: i[0],
          lat: +i[1],
          lng: +i[2],
          address: i[3],
          website: i[4]
        }
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
    // TODO: Fix
    // scrollintoview breaks for anything not firefox or chrome
  }
  return target;
}

function getDateBoundary(today:Date):Date {
  let boundary = new Date('' + today.getFullYear());
  if(today.getMonth() <= 6) {
    boundary.setMonth(7);
  } else {
    boundary.setMonth(1);
    boundary.setFullYear(boundary.getFullYear() + 1);
  }
  return boundary;
}

function getWeeks(current?:Date, goal?:Date):ListSeperator[] {
  goal = goal || DATEBOUNDARY;
  current = current || TODAY;
  let dates: ListSeperator[] = [];
  let weekNum = getWeekNumber(TODAY);

  current.setDate(current.getDate() - current.getDay() + 1);

  while (current.valueOf() < goal.valueOf()) {
    dates.push(new ListSeperator(current, 'uke ' + weekNum));
    weekNum += 1;
    current = new Date(current.valueOf());
    current.setDate(current.getDate() + 7);
  }

  return dates;
}

function getMonthSeparators(today:Date, boundry:Date):ListSeperator[] {
  let year = today.getFullYear();
  let month = today.getMonth() + 1;
  let lastMonthWithinBound = new Date(year + '-' + leadingZero(month) + '-01');
  let monthSeparators:any[] = [];

  while(lastMonthWithinBound.valueOf() < boundry.valueOf()) {
    lastMonthWithinBound = new Date((month == 12 ? year + 1 : year) + '-' + leadingZero(month++%12) + '-01');
    monthSeparators.push(lastMonthWithinBound);
  }

  return monthSeparators.map(date => new ListSeperator(date));
}

function getWeekNumber (date:Date) {
  let d:any = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  let dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  let yearStart:any = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1)/7)
}

function leadingZero(n:number):string {
  return (n > 9 ? '' : '0') + n;
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
