/**
 * AutoScroller - Gère le défilement automatique de la page.
 */
export default class AutoScroller {
    constructor() {
      this.active = false;
      this.speed = 1; // Pixels par frame (approximatif)
      this.animationFrame = null;
      this.lastTime = 0;
      this.accumulatedScroll = 0;
    }
  
    /**
     * Démarre ou arrête le défilement
     */
    toggle() {
      if (this.active) {
        this.stop();
      } else {
        this.start();
      }
      return this.active;
    }
  
    start() {
      if (this.active) return;
      this.active = true;
      this.lastTime = performance.now();
      this.loop();
    }
  
    stop() {
      this.active = false;
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
    }
  
    setSpeed(newSpeed) {
      // Speed attendue entre 1 (lent) et 10 (rapide)
      this.speed = Math.max(1, Math.min(20, newSpeed));
    }
  
    loop(currentTime = performance.now()) {
      if (!this.active) return;
  
      const deltaTime = currentTime - this.lastTime;
      this.lastTime = currentTime;
  
      // Logique pour normaliser la vitesse quel que soit le framerate de l'écran
      // Vitesse de base : 60px par seconde * speed factor
      const pixelsPerSecond = 30 * this.speed;
      const pixelsToScroll = (pixelsPerSecond * deltaTime) / 1000;
  
      this.accumulatedScroll += pixelsToScroll;
  
      if (this.accumulatedScroll >= 1) {
        const pixels = Math.floor(this.accumulatedScroll);
        window.scrollBy(0, pixels);
        this.accumulatedScroll -= pixels;
      }
      
      // Si on est en bas de page, on arrête
      if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
        this.stop();
        // On pourrait déclencher le chargement du chapitre suivant ici
      } else {
        this.animationFrame = requestAnimationFrame((t) => this.loop(t));
      }
    }
  }