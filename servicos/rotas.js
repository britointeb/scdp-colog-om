export function entityHref(page,key){return `#${page}${key?'/'+encodeURIComponent(key):''}`;}
export function readRoute(hash=''){
  const [candidate,...rest]=hash.replace(/^#/,'').split('/');
  const page=['viagens','orcamento','fluxo','pcdp','proposto'].includes(candidate)?candidate:'viagens';
  let key='';try{key=decodeURIComponent(rest.join('/'));}catch{/* Preserve navigation for malformed links. */}
  return {page,key};
}
