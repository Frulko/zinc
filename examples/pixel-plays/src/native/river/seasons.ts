import { Color } from '../renderer';
export interface Season {
  name: string; water: Color[]; grass: Color[]; deep: Color; mid: Color; light: Color;
  soil: Color; pine: Color; snow: boolean; cool: Color; warm: Color; ambience: string;
}
export const seasons: Season[] = [
  {
    name:'PRINTEMPS',water:[[45,99,110],[58,123,127],[75,143,139],[105,166,151]],
    grass:[[45,74,49],[69,100,50],[100,130,63],[138,157,85],[172,180,111]],
    deep:[52,91,58],mid:[104,147,75],light:[168,187,108],soil:[166,150,112],pine:[66,109,76],snow:false,
    cool:[47,48,77],warm:[255,235,188],ambience:'river-spring',
  },
  {
    name:'ÉTÉ',water:[[32,83,94],[41,108,111],[64,133,128],[91,155,142]],
    grass:[[36,63,46],[53,85,48],[81,113,53],[115,139,68],[151,161,89]],
    deep:[44,76,48],mid:[78,116,58],light:[131,158,85],soil:[173,152,110],pine:[46,87,65],snow:false,
    cool:[46,38,84],warm:[255,232,180],ambience:'river-summer',
  },
  {
    name:'AUTOMNE',water:[[48,82,90],[59,103,108],[79,124,123],[108,144,134]],
    grass:[[65,64,42],[96,83,44],[133,105,52],[164,132,65],[192,160,91]],
    deep:[109,61,38],mid:[176,94,43],light:[224,161,72],soil:[164,119,78],pine:[55,88,66],snow:false,
    cool:[66,45,80],warm:[255,218,160],ambience:'river-autumn',
  },
  {
    name:'HIVER',water:[[44,68,88],[59,88,105],[81,112,124],[121,147,151]],
    grass:[[150,165,165],[174,187,185],[201,211,203],[224,229,216],[239,240,223]],
    deep:[146,160,157],mid:[192,204,195],light:[234,236,219],soil:[206,215,207],pine:[68,102,93],snow:true,
    cool:[63,76,103],warm:[235,243,230],ambience:'river-winter',
  },
];
