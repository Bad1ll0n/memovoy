'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface CountryData {
  countryCode: string
  countryName: string
  count: number
}

interface Props {
  countries: CountryData[]
  onSelectCountry: (name: string) => void
}

// Country name → [lat, lng] lookup (covers the most common travel destinations)
const COUNTRY_COORDS: Record<string, [number, number]> = {
  Portugal: [39.4, -8.2],
  Spain: [40.4, -3.7],
  France: [46.2, 2.2],
  Italy: [41.9, 12.5],
  Germany: [51.2, 10.5],
  'United Kingdom': [55.4, -3.4],
  Netherlands: [52.1, 5.3],
  Belgium: [50.5, 4.5],
  Switzerland: [46.8, 8.2],
  Austria: [47.5, 14.5],
  Poland: [51.9, 19.1],
  'Czech Republic': [49.8, 15.5],
  Hungary: [47.2, 19.5],
  Romania: [45.9, 24.9],
  Greece: [39.1, 21.8],
  Turkey: [38.9, 35.2],
  Sweden: [60.1, 18.6],
  Norway: [64.6, 17.7],
  Denmark: [55.7, 10.0],
  Finland: [64.0, 26.0],
  Russia: [61.5, 105.3],
  Ukraine: [48.4, 31.2],
  USA: [37.1, -95.7],
  'United States': [37.1, -95.7],
  Canada: [56.1, -106.3],
  Mexico: [23.6, -102.6],
  Brazil: [-14.2, -51.9],
  Argentina: [-38.4, -63.6],
  Chile: [-35.7, -71.5],
  Colombia: [4.6, -74.1],
  Peru: [-9.2, -75.0],
  Bolivia: [-16.3, -63.6],
  Ecuador: [-1.8, -78.2],
  Venezuela: [6.4, -66.6],
  Cuba: [21.5, -77.8],
  Japan: [36.2, 138.3],
  China: [35.9, 104.2],
  India: [20.6, 79.1],
  Indonesia: [-0.8, 113.9],
  Thailand: [15.9, 100.9],
  Vietnam: [14.1, 108.3],
  Philippines: [12.9, 121.8],
  Malaysia: [4.2, 108.0],
  Singapore: [1.3, 103.8],
  Australia: [-25.3, 133.8],
  'New Zealand': [-40.9, 174.9],
  'South Korea': [35.9, 127.8],
  Taiwan: [23.7, 121.0],
  'Hong Kong': [22.4, 114.1],
  Morocco: [31.8, -7.1],
  Egypt: [26.8, 30.8],
  'South Africa': [-30.6, 22.9],
  Kenya: [-0.0, 37.9],
  Tanzania: [-6.4, 34.9],
  Ethiopia: [9.1, 40.5],
  Ghana: [7.9, -1.0],
  Nigeria: [9.1, 8.7],
  Israel: [31.0, 34.9],
  Jordan: [30.6, 36.2],
  'Saudi Arabia': [23.9, 45.1],
  'United Arab Emirates': [23.4, 53.8],
  Iran: [32.4, 53.7],
  Iraq: [33.2, 43.7],
  Pakistan: [30.4, 69.3],
  Bangladesh: [23.7, 90.4],
  'Sri Lanka': [7.9, 80.8],
  Nepal: [28.4, 84.1],
  Iceland: [64.9, -19.0],
  Ireland: [53.4, -8.2],
  Croatia: [45.1, 15.2],
  Serbia: [44.0, 21.0],
  Bulgaria: [42.7, 25.5],
  Slovakia: [48.7, 19.7],
  Slovenia: [46.1, 14.6],
  'North Macedonia': [41.6, 21.7],
  Albania: [41.2, 20.2],
  Bosnia: [43.9, 17.7],
  Montenegro: [42.7, 19.4],
  Latvia: [56.9, 24.6],
  Lithuania: [55.2, 23.9],
  Estonia: [58.6, 25.0],
  Belarus: [53.7, 28.0],
  Moldova: [47.4, 28.4],
  Luxembourg: [49.8, 6.1],
  Malta: [35.9, 14.4],
  Cyprus: [35.1, 33.4],
  Mozambique: [-18.7, 35.5],
  Zimbabwe: [-19.0, 29.2],
  Zambia: [-13.1, 27.8],
  Uganda: [1.4, 32.3],
  Rwanda: [-1.9, 29.9],
  Senegal: [14.5, -14.5],
  'Ivory Coast': [7.5, -5.5],
  Cameroon: [3.9, 11.5],
  'Dominican Republic': [18.7, -70.2],
  Jamaica: [18.1, -77.3],
  'Puerto Rico': [18.2, -66.6],
  'Costa Rica': [9.7, -83.8],
  Panama: [8.5, -80.8],
  Guatemala: [15.8, -90.2],
  Honduras: [15.2, -86.2],
  Nicaragua: [12.9, -85.2],
  'El Salvador': [13.8, -88.9],
  Belize: [17.2, -88.5],
  Bahamas: [25.0, -77.4],
  Uruguay: [-32.5, -55.8],
  Paraguay: [-23.4, -58.4],
  Guyana: [4.9, -58.9],
  Suriname: [3.9, -56.0],
  Laos: [17.1, 104.3],
  Cambodia: [12.6, 104.9],
  Myanmar: [16.9, 96.2],
  Mongolia: [46.9, 103.8],
  Kazakhstan: [48.0, 66.9],
  Uzbekistan: [41.4, 64.6],
  Georgia: [42.3, 43.4],
  Armenia: [40.1, 45.0],
  Azerbaijan: [40.1, 47.6],
  Kyrgyzstan: [41.2, 74.8],
  Tajikistan: [38.9, 71.3],
  Afghanistan: [33.9, 67.7],
  Madagascar: [-18.8, 46.9],
  Mauritius: [-20.3, 57.6],
  Maldives: [3.2, 73.2],
  Seychelles: [-4.7, 55.5],
  Fiji: [-17.7, 178.1],
  'Papua New Guinea': [-6.3, 143.6],
}

function getCoords(countryName: string): [number, number] | null {
  // Direct match
  if (COUNTRY_COORDS[countryName]) return COUNTRY_COORDS[countryName]
  // Case-insensitive match
  const key = Object.keys(COUNTRY_COORDS).find(
    (k) => k.toLowerCase() === countryName.toLowerCase(),
  )
  return key ? COUNTRY_COORDS[key] : null
}

export default function WorldMap({ countries, onSelectCountry }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.CircleMarker[]>([])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 6,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || countries.length === 0) return

    // Remove previous markers
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    countries.forEach((c) => {
      const coords = getCoords(c.countryName)
      if (!coords) return

      const marker = L.circleMarker(coords, {
        radius: Math.min(4 + c.count * 2, 20),
        fillColor: '#fca311',
        color: '#e08c00',
        weight: 1.5,
        opacity: 0.9,
        fillOpacity: 0.7,
      })

      marker.bindTooltip(`${c.countryName} (${c.count})`, {
        permanent: false,
        direction: 'top',
        sticky: true,
      })

      marker.bindPopup(
        `<strong style="font-size:13px">${c.countryName}</strong><br><span style="font-size:11px;opacity:.75">${c.count} roteiro${c.count !== 1 ? 's' : ''}</span>`,
        { closeButton: false, maxWidth: 160, className: 'map-popup-memovoy' },
      )

      marker.on('click', () => onSelectCountry(c.countryName))
      marker.addTo(map)
      markersRef.current.push(marker)
    })
  }, [countries, onSelectCountry])

  return (
    <div
      ref={containerRef}
      style={{ height: 400, borderRadius: 12, overflow: 'hidden' }}
    />
  )
}
