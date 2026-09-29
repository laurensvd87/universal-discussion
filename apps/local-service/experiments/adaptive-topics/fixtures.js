// Frozen algebraic geometry, not E5 output. Subject labels never enter planner.
const unit=values=>{const length=Math.hypot(...values);return [...values.map(x=>x/length),...Array(384-values.length).fill(0)];};
const source=(id,values)=>({id,url:`https://example.com/${id}`,provenance:'owner-local-page-embedding/v1',
  extractorVersion:'main-text-prefix/v1',embedding:{modelId:'e5-small-q8-browser-main-prefix-v1',values:unit(values)}});
const v=Math.sqrt(.985),e=Math.sqrt(.015),c=.94,s=Math.sqrt(1-c*c);
export const FIXTURES=Object.freeze({
  schema:'adaptive-topic-algebraic-fixtures/v1',provenance:'project-created-synthetic',
  examples:[
    {id:'opposite-viewpoints-sparse',expected:['debate-a,debate-b'],sources:[source('debate-a',[1,0]),source('debate-b',[.91,Math.sqrt(1-.91*.91)])],
      labels:{'debate-a':'one-question','debate-b':'one-question'},links:[]},
    {id:'recurring-events-supported',expected:['june-a,june-b','august-a,august-b'],
      sources:[source('june-a',[v,0,e,0]),source('june-b',[v,0,-e,0]),
        source('august-a',[v*c,v*s,0,e]),source('august-b',[v*c,v*s,0,-e])],
      labels:{'june-a':'june-event','june-b':'june-event','august-a':'august-event','august-b':'august-event'},
      links:['june-a','june-b','august-a','august-b'].map(sourceId=>({sourceId,topicId:'initial-topic',method:'learned-provisional'}))},
    {id:'duplicate-support-discount',expected:['june-a,june-copy,august-a,august-copy'],
      sources:[source('june-a',[v,0,e,0]),source('june-copy',[v,0,e,0]),
        source('august-a',[v*c,v*s,0,e]),source('august-copy',[v*c,v*s,0,e])],
      labels:{'june-a':'june-event','june-copy':'june-event','august-a':'august-event','august-copy':'august-event'},
      links:['june-a','june-copy','august-a','august-copy'].map(sourceId=>({sourceId,topicId:'initial-topic',method:'learned-provisional'}))},
    {id:'ambiguous-geometry-abstains',expected:['near-a','near-b','middle'],sources:[source('near-a',[1,0]),source('near-b',[.91,Math.sqrt(1-.91*.91)]),
      source('middle',[1+.91,Math.sqrt(1-.91*.91)])],labels:{'near-a':'event-a','near-b':'event-b','middle':'uncertain'},
      links:[{sourceId:'near-a',topicId:'pinned-a',method:'manual-confirmed'},
        {sourceId:'near-b',topicId:'pinned-b',method:'manual-confirmed'}]},
  ],
});
