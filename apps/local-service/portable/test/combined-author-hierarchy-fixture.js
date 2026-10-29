// Numeric-only, distinct-material general-web fixtures; no model or network.
export function combinedHierarchyFixtureRows(){return [1,.97,Math.sqrt(.75),.8].map((x,i)=>{
 const values=Array(384).fill(0);values[0]=x;values[1]=-Math.sqrt(1-x*x);
 return {id:'combined-native-source-'+i,title:`Zenith Gamepad ${i<2?'Pro':'Mini'} ${i%2?'screen':'battery'} replacement`,values};
});}
