import { writeFileSync } from 'fs';
import { BiomeId } from './src/enums/biome-id.ts';
import { BiomePoolTier } from './src/enums/biome-pool-tier.ts';
import { TimeOfDay } from './src/enums/time-of-day.ts';
import { SpeciesId } from './src/enums/species-id.ts';
import { dailyBiomeWeights } from './src/data/balance/daily-biome-weights.ts';

import { abyssBiome } from './src/data/balance/biomes/abyss.ts';
import { badlandsBiome } from './src/data/balance/biomes/badlands.ts';
import { beachBiome } from './src/data/balance/biomes/beach.ts';
import { caveBiome } from './src/data/balance/biomes/cave.ts';
import { constructionSiteBiome } from './src/data/balance/biomes/construction-site.ts';
import { desertBiome } from './src/data/balance/biomes/desert.ts';
import { dojoBiome } from './src/data/balance/biomes/dojo.ts';
import { endBiome } from './src/data/balance/biomes/end.ts';
import { factoryBiome } from './src/data/balance/biomes/factory.ts';
import { fairyCaveBiome } from './src/data/balance/biomes/fairy-cave.ts';
import { forestBiome } from './src/data/balance/biomes/forest.ts';
import { grassBiome } from './src/data/balance/biomes/grass.ts';
import { graveyardBiome } from './src/data/balance/biomes/graveyard.ts';
import { iceCaveBiome } from './src/data/balance/biomes/ice-cave.ts';
import { islandBiome } from './src/data/balance/biomes/island.ts';
import { jungleBiome } from './src/data/balance/biomes/jungle.ts';
import { laboratoryBiome } from './src/data/balance/biomes/laboratory.ts';
import { lakeBiome } from './src/data/balance/biomes/lake.ts';
import { meadowBiome } from './src/data/balance/biomes/meadow.ts';
import { metropolisBiome } from './src/data/balance/biomes/metropolis.ts';
import { mountainBiome } from './src/data/balance/biomes/mountain.ts';
import { plainsBiome } from './src/data/balance/biomes/plains.ts';
import { powerPlantBiome } from './src/data/balance/biomes/power-plant.ts';
import { ruinsBiome } from './src/data/balance/biomes/ruins.ts';
import { seaBiome } from './src/data/balance/biomes/sea.ts';
import { seabedBiome } from './src/data/balance/biomes/seabed.ts';
import { slumBiome } from './src/data/balance/biomes/slum.ts';
import { snowyForestBiome } from './src/data/balance/biomes/snowy-forest.ts';
import { spaceBiome } from './src/data/balance/biomes/space.ts';
import { swampBiome } from './src/data/balance/biomes/swamp.ts';
import { tallGrassBiome } from './src/data/balance/biomes/tall-grass.ts';
import { templeBiome } from './src/data/balance/biomes/temple.ts';
import { townBiome } from './src/data/balance/biomes/town.ts';
import { volcanoBiome } from './src/data/balance/biomes/volcano.ts';
import { wastelandBiome } from './src/data/balance/biomes/wasteland.ts';

const allBiomeData: Record<number, any> = {
  [BiomeId.ABYSS]: abyssBiome,
  [BiomeId.BADLANDS]: badlandsBiome,
  [BiomeId.BEACH]: beachBiome,
  [BiomeId.CAVE]: caveBiome,
  [BiomeId.CONSTRUCTION_SITE]: constructionSiteBiome,
  [BiomeId.DESERT]: desertBiome,
  [BiomeId.DOJO]: dojoBiome,
  [BiomeId.END]: endBiome,
  [BiomeId.FACTORY]: factoryBiome,
  [BiomeId.FAIRY_CAVE]: fairyCaveBiome,
  [BiomeId.FOREST]: forestBiome,
  [BiomeId.GRASS]: grassBiome,
  [BiomeId.GRAVEYARD]: graveyardBiome,
  [BiomeId.ICE_CAVE]: iceCaveBiome,
  [BiomeId.ISLAND]: islandBiome,
  [BiomeId.JUNGLE]: jungleBiome,
  [BiomeId.LABORATORY]: laboratoryBiome,
  [BiomeId.LAKE]: lakeBiome,
  [BiomeId.MEADOW]: meadowBiome,
  [BiomeId.METROPOLIS]: metropolisBiome,
  [BiomeId.MOUNTAIN]: mountainBiome,
  [BiomeId.PLAINS]: plainsBiome,
  [BiomeId.POWER_PLANT]: powerPlantBiome,
  [BiomeId.RUINS]: ruinsBiome,
  [BiomeId.SEA]: seaBiome,
  [BiomeId.SEABED]: seabedBiome,
  [BiomeId.SLUM]: slumBiome,
  [BiomeId.SNOWY_FOREST]: snowyForestBiome,
  [BiomeId.SPACE]: spaceBiome,
  [BiomeId.SWAMP]: swampBiome,
  [BiomeId.TALL_GRASS]: tallGrassBiome,
  [BiomeId.TEMPLE]: templeBiome,
  [BiomeId.TOWN]: townBiome,
  [BiomeId.VOLCANO]: volcanoBiome,
  [BiomeId.WASTELAND]: wastelandBiome,
};

const biomeIdToName: Record<number, string> = {};
for (const [name, id] of Object.entries(BiomeId)) {
  biomeIdToName[id as number] = name;
}

const output: Record<string, any> = {};

for (const [biomeIdStr, biomeData] of Object.entries(allBiomeData)) {
  const biomeId = Number(biomeIdStr);
  const biomeName = biomeIdToName[biomeId] ?? String(biomeId);
  
  const links = (biomeData.biomeLinks ?? []).map((link: any) => {
    if (Array.isArray(link)) {
      return { biome: biomeIdToName[link[0]] ?? link[0], weight: link[1] };
    }
    return { biome: biomeIdToName[link] ?? link, weight: 1 };
  });

  const pool: Record<string, Record<string, number[]>> = {};
  for (const [tierKey, tierData] of Object.entries(biomeData.pokemonPool as Record<string, any>)) {
    const tier = Number(tierKey);
    const tierName = BiomePoolTier[tier] ?? String(tier);
    pool[tierName] = {};
    for (const [todKey, species] of Object.entries(tierData as Record<string, any>)) {
      const tod = Number(todKey);
      const todName = tod === -1 ? 'ALL' : (TimeOfDay[tod] ?? String(tod));
      pool[tierName][todName] = species as number[];
    }
  }

  output[biomeName] = { biomeId, links, pokemonPool: pool };
}

// Species name map
const speciesNames: Record<number, string> = {};
for (const [name, id] of Object.entries(SpeciesId)) {
  speciesNames[id as number] = name;
}

// BiomeId map
const biomeIds: Record<string, number> = {};
for (const [name, id] of Object.entries(BiomeId)) {
  biomeIds[name] = id as number;
}

// Daily biome weights
const weights: Record<string, number> = {};
for (const [id, w] of Object.entries(dailyBiomeWeights)) {
  weights[biomeIdToName[Number(id)] ?? id] = w as number;
}

writeFileSync('./extracted-biome-data.json', JSON.stringify({ biomes: output, speciesNames, biomeIds, dailyBiomeWeights: weights }, null, 2));
console.log('Done!');
