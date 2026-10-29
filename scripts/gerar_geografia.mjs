import fs from 'node:fs';
const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const cities=fs.readFileSync(new URL('../geografia/cities15000.txt',import.meta.url),'utf8').trim().split('\n').map(line=>{const a=line.split('\t');return {id:a[0],name:a[1],names:[a[1],a[2],...a[3].split(',')].map(normalize),lat:+a[4],lon:+a[5],country:a[8],admin:a[10],population:+a[14]};});
const targets={BR:['Boa Vista','Rio de Janeiro','Brasília','São Paulo','São José dos Campos','Manaus','Salvador','Belém','Passo Fundo','Guarulhos','Fortaleza','Taubaté','Porto Velho','Porto Alegre','Campo Grande','João Pessoa','Santo Ângelo','Curitiba','Uruguaiana','Recife'],DE:['Hamburgo','Munique'],AR:['Buenos Aires'],FR:['Marignane','Paris'],US:['Richmond - Virginia','Washington']};
const aliases={'Hamburgo':'Hamburg','Munique':'Munich','Richmond - Virginia':'Richmond'};
const result=[];
for(const [country,names]of Object.entries(targets))for(const name of names){let found=cities.filter(c=>c.country===country&&c.names.includes(normalize(aliases[name]||name)));if(name==='Richmond - Virginia')found=found.filter(c=>c.admin==='VA');if(name==='Washington')found=found.filter(c=>c.admin==='DC');found.sort((a,b)=>b.population-a.population);if(!found.length)throw Error('Sem coordenadas: '+name);const c=found[0];result.push({name,lat:c.lat,lon:c.lon,country,geonameId:c.id});}
fs.writeFileSync(new URL('../geografia/cidades.json',import.meta.url),JSON.stringify(result));
const world=JSON.parse(fs.readFileSync(new URL('../geografia/mundo.geojson',import.meta.url),'utf8'));
world.features=world.features.filter(f=>f.properties.ADM0_A3!=='ATA').map(f=>({type:'Feature',properties:{name:f.properties.NAME_PT||f.properties.NAME,iso:f.properties.ADM0_A3},geometry:f.geometry}));
fs.writeFileSync(new URL('../geografia/mundo.json',import.meta.url),JSON.stringify(world));
console.log(result.length+' cidades georreferenciadas a partir do GeoNames.');
