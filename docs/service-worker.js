const CACHE_NAME = 'score-app-cache-v1';
// Generate array of audiofiles 0.mp3 to 50.mp3
const AUDIO_FILES = Array.from({ length: 51 }, (_, i) => `/audio/${i}.mp3`);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/index.html', // Adjust based on your entry point
		    '/audio/-.mp3',
//		    '/audio/asd.mp3',
		    '/audio/airhown.mp3',
//		  '/audio/andra.mp3',
//		  '/audio/avbryt.mp3',
		    '/audio/bana.mp3',
//		  '/audio/eld.mp3',
//		  '/audio/eld_upp_hör.mp3',
//		  '/audio/eld_upphör.mp3',
//		  '/audio/elfte.mp3',
//		  '/audio/femte.mp3',
//		  '/audio/fjärde.mp3',
		    '/audio/full_pott.mp3',
//		  '/audio/första.mp3',
//		  '/audio/hör.mp3',
//		  '/audio/ladda.mp3',
//		  '/audio/med_fem_skott.mp3',
		    '/audio/nice.mp3',
//		  '/audio/nionde.mp3',
		    '/audio/poäng.mp3',
//		  '/audio/proppa.mp3',
		    '/audio/serie.mp3',
//		  '/audio/sjunde.mp3',
//		  '/audio/sjätte.mp3',
		    '/audio/skjutlag.mp3',
//		  '/audio/tionde.mp3',
//		  '/audio/tolfte.mp3',
		    '/audio/totalt.mp3',
//		  '/audio/tredje.mp3',
//		  '/audio/upp.mp3',
		    '/audio/x.mp3',
		    '/audio/ångra.mp3',
//		  '/audio/åttonde.mp3',
        ...AUDIO_FILES
      ]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
