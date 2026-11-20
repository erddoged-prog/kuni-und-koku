import type { Adjacency, ProvinceDef, ProvinceId } from './types';

// 30 stilisierte Provinzen. Koordinaten: x 0–100 (West→Ost), y 0–80 (Nord→Süd).
// koku = Grundertrag pro Runde (Jahreszeit).
const LIST: ProvinceDef[] = [
  // Kyushu
  { id: 'satsuma', name: 'Satsuma', kanji: '薩摩', koku: 110, terrain: 'hills', x: 12, y: 75 },
  { id: 'higo', name: 'Higo', kanji: '肥後', koku: 130, terrain: 'plains', x: 8, y: 66 },
  { id: 'chikuzen', name: 'Chikuzen', kanji: '筑前', koku: 140, terrain: 'plains', x: 9, y: 58 },
  { id: 'bungo', name: 'Bungo', kanji: '豊後', koku: 100, terrain: 'hills', x: 17, y: 64 },
  // Shikoku
  { id: 'iyo', name: 'Iyo', kanji: '伊予', koku: 100, terrain: 'hills', x: 27, y: 60 },
  { id: 'tosa', name: 'Tosa', kanji: '土佐', koku: 80, terrain: 'forest', x: 34, y: 64 },
  { id: 'sanuki', name: 'Sanuki', kanji: '讃岐', koku: 110, terrain: 'plains', x: 38, y: 57 },
  // Chugoku
  { id: 'nagato', name: 'Nagato', kanji: '長門', koku: 90, terrain: 'hills', x: 17, y: 51 },
  { id: 'aki', name: 'Aki', kanji: '安芸', koku: 120, terrain: 'hills', x: 27, y: 52 },
  { id: 'izumo', name: 'Izumo', kanji: '出雲', koku: 100, terrain: 'forest', x: 27, y: 44.5 },
  { id: 'bizen', name: 'Bizen', kanji: '備前', koku: 130, terrain: 'plains', x: 37, y: 49 },
  { id: 'harima', name: 'Harima', kanji: '播磨', koku: 150, terrain: 'plains', x: 44, y: 47 },
  // Kinai
  { id: 'settsu', name: 'Settsu', kanji: '摂津', koku: 170, terrain: 'river', x: 48, y: 53 },
  { id: 'yamashiro', name: 'Yamashiro (Kyōto)', kanji: '山城', koku: 200, terrain: 'plains', x: 53, y: 47, isCapital: true },
  { id: 'yamato', name: 'Yamato', kanji: '大和', koku: 150, terrain: 'hills', x: 53, y: 54 },
  { id: 'kii', name: 'Kii', kanji: '紀伊', koku: 90, terrain: 'forest', x: 53, y: 62 },
  { id: 'omi', name: 'Ōmi', kanji: '近江', koku: 170, terrain: 'river', x: 57, y: 45 },
  { id: 'ise', name: 'Ise', kanji: '伊勢', koku: 130, terrain: 'plains', x: 60, y: 56 },
  // Chubu
  { id: 'echizen', name: 'Echizen', kanji: '越前', koku: 120, terrain: 'forest', x: 58, y: 38 },
  { id: 'mino', name: 'Mino', kanji: '美濃', koku: 150, terrain: 'river', x: 64, y: 42 },
  { id: 'owari', name: 'Owari', kanji: '尾張', koku: 160, terrain: 'plains', x: 65, y: 48 },
  { id: 'suruga', name: 'Suruga', kanji: '駿河', koku: 130, terrain: 'plains', x: 75, y: 49 },
  { id: 'shinano', name: 'Shinano', kanji: '信濃', koku: 120, terrain: 'hills', x: 72, y: 37 },
  { id: 'kai', name: 'Kai', kanji: '甲斐', koku: 100, terrain: 'hills', x: 77, y: 43 },
  { id: 'echigo', name: 'Echigo', kanji: '越後', koku: 140, terrain: 'river', x: 78, y: 28 },
  // Kanto
  { id: 'musashi', name: 'Musashi', kanji: '武蔵', koku: 180, terrain: 'plains', x: 85, y: 40 },
  { id: 'sagami', name: 'Sagami', kanji: '相模', koku: 110, terrain: 'hills', x: 83, y: 47 },
  { id: 'hitachi', name: 'Hitachi', kanji: '常陸', koku: 140, terrain: 'plains', x: 92, y: 37 },
  // Tohoku
  { id: 'mutsu', name: 'Mutsu', kanji: '陸奥', koku: 150, terrain: 'forest', x: 95, y: 22 },
  { id: 'dewa', name: 'Dewa', kanji: '出羽', koku: 110, terrain: 'forest', x: 87, y: 15 },
];

export const PROVINCES: Record<ProvinceId, ProvinceDef> = Object.fromEntries(LIST.map((p) => [p.id, p]));
export const PROVINCE_IDS: ProvinceId[] = LIST.map((p) => p.id);
export const CAPITAL_ID: ProvinceId = 'yamashiro';

// Nachbarschaftsgraph (ungerichtet). sea = Seeweg, im Winter gesperrt.
export const ADJACENCIES: Adjacency[] = [
  // Kyushu
  { a: 'satsuma', b: 'higo' },
  { a: 'satsuma', b: 'bungo' },
  { a: 'higo', b: 'chikuzen' },
  { a: 'higo', b: 'bungo' },
  { a: 'chikuzen', b: 'bungo' },
  { a: 'chikuzen', b: 'nagato', sea: true },
  { a: 'bungo', b: 'iyo', sea: true },
  { a: 'bungo', b: 'tosa', sea: true },
  // Shikoku
  { a: 'iyo', b: 'tosa' },
  { a: 'iyo', b: 'sanuki' },
  { a: 'tosa', b: 'sanuki' },
  { a: 'iyo', b: 'aki', sea: true },
  { a: 'sanuki', b: 'bizen', sea: true },
  { a: 'sanuki', b: 'settsu', sea: true },
  // Chugoku
  { a: 'nagato', b: 'aki' },
  { a: 'nagato', b: 'izumo' },
  { a: 'aki', b: 'izumo' },
  { a: 'aki', b: 'bizen' },
  { a: 'izumo', b: 'bizen' },
  { a: 'bizen', b: 'harima' },
  // Kinai
  { a: 'harima', b: 'settsu' },
  { a: 'harima', b: 'yamashiro' },
  { a: 'settsu', b: 'yamashiro' },
  { a: 'settsu', b: 'yamato' },
  { a: 'settsu', b: 'kii' },
  { a: 'yamato', b: 'kii' },
  { a: 'yamato', b: 'yamashiro' },
  { a: 'yamato', b: 'ise' },
  { a: 'kii', b: 'ise' },
  { a: 'yamashiro', b: 'omi' },
  { a: 'omi', b: 'ise' },
  { a: 'omi', b: 'echizen' },
  { a: 'omi', b: 'mino' },
  { a: 'omi', b: 'owari' },
  { a: 'yamashiro', b: 'echizen' },
  // Chubu
  { a: 'ise', b: 'owari' },
  { a: 'echizen', b: 'mino' },
  { a: 'echizen', b: 'shinano' },
  { a: 'mino', b: 'owari' },
  { a: 'mino', b: 'shinano' },
  { a: 'owari', b: 'suruga' },
  { a: 'suruga', b: 'kai' },
  { a: 'suruga', b: 'sagami' },
  { a: 'kai', b: 'shinano' },
  { a: 'kai', b: 'musashi' },
  { a: 'kai', b: 'sagami' },
  { a: 'shinano', b: 'echigo' },
  { a: 'shinano', b: 'musashi' },
  { a: 'echigo', b: 'musashi' },
  { a: 'echigo', b: 'dewa' },
  { a: 'echigo', b: 'mutsu' },
  { a: 'echigo', b: 'hitachi' },
  // Kanto / Tohoku
  { a: 'musashi', b: 'sagami' },
  { a: 'musashi', b: 'hitachi' },
  { a: 'hitachi', b: 'mutsu' },
  { a: 'mutsu', b: 'dewa' },
];
