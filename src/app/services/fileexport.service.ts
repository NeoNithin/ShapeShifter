import 'rxjs/add/operator/first';

import { Injectable } from '@angular/core';
import { LayerUtil, VectorLayer } from 'app/model/layers';
import { Animation } from 'app/model/timeline';
import { AvdSerializer, SpriteSerializer, SvgSerializer } from 'app/scripts/export';
import { State, Store } from 'app/store';
import { getHiddenLayerIds, getVectorLayer } from 'app/store/layers/selectors';
import { getAnimation } from 'app/store/timeline/selectors';
import * as $ from 'jquery';
import * as JSZip from 'jszip';
import * as _ from 'lodash';

// Store a version number just in case we ever change the export format...
const IMPORT_EXPORT_VERSION = 1;

const EXPORTED_FPS = [30, 60];

/**
 * A simple service that exports vectors and animations.
 */
@Injectable()
export class FileExportService {
  static fromJSON(jsonObj: any) {
    const { layers, timeline } = jsonObj;
    const vectorLayer = new VectorLayer(layers.vectorLayer);
    const hiddenLayerIds = new Set<string>(layers.hiddenLayerIds);
    const animation = new Animation(timeline.animation);
    return { vectorLayer, hiddenLayerIds, animation };
  }

  constructor(private readonly store: Store<State>) {}

  exportJSON() {
    const vl = this.getVectorLayer();
    const anim = this.getAnimation();
    const jsonStr = JSON.stringify(
      {
        version: IMPORT_EXPORT_VERSION,
        layers: {
          vectorLayer: vl.toJSON(),
          hiddenLayerIds: Array.from(this.getHiddenLayerIds()),
        },
        timeline: {
          animation: anim.toJSON(),
        },
      },
      undefined,
      2,
    );
    downloadFile(jsonStr, `${vl.name}.shapeshifter`);
  }

  exportSvg() {
    // Export standalone SVG frames.
    const vl = this.getVectorLayerWithoutHiddenLayers();
    const anim = this.getAnimationWithoutHiddenBlocks();
    if (!anim.blocks.length) {
      // Just export an SVG if there are no animation blocks defined.
      const svg = SvgSerializer.toSvgString(vl);
      downloadFile(svg, `${vl.name}.svg`);
      return;
    }
    const zip = new JSZip();
    EXPORTED_FPS.forEach(fps => {
      const numSteps = Math.ceil(anim.duration / 1000 * fps);
      const svgs = SpriteSerializer.createSvgFrames(vl, anim, numSteps);
      const length = (numSteps - 1).toString().length;
      const fpsFolder = zip.folder(`${fps}fps`);
      svgs.forEach((s, i) => {
        fpsFolder.file(`frame${_.padStart(i.toString(), length, '0')}.svg`, s);
      });
    });
    zip.generateAsync({ type: 'blob' }).then(content => {
      downloadFile(content, `frames_${vl.name}.zip`);
    });
  }

  // TODO: should we or should we not export hidden layers?
  exportVectorDrawable() {
    const vl = this.getVectorLayerWithoutHiddenLayers();
    const vd = AvdSerializer.toVectorDrawableXmlString(vl);
    const fileName = `vd_${vl.name}.xml`;
    downloadFile(vd, fileName);
  }

  exportAnimatedVectorDrawable() {
    const vl = this.getVectorLayerWithoutHiddenLayers();
    const anim = this.getAnimationWithoutHiddenBlocks();
    const avd = AvdSerializer.toAnimatedVectorDrawableXmlString(vl, anim);
    const fileName = `avd_${anim.name}.xml`;
    downloadFile(avd, fileName);
  }

  exportSvgSpritesheet() {
    // Create an svg sprite animation.
    const vl = this.getVectorLayerWithoutHiddenLayers();
    const anim = this.getAnimationWithoutHiddenBlocks();
    const zip = new JSZip();
    EXPORTED_FPS.forEach(fps => {
      const numSteps = Math.ceil(anim.duration / 1000 * fps);
      const svgSprite = SpriteSerializer.createSvgSprite(vl, anim, numSteps);
      const cssSprite = SpriteSerializer.createCss(vl.width, vl.height, anim.duration, numSteps);
      const fileName = `sprite_${fps}fps`;
      const htmlSprite = SpriteSerializer.createHtml(`${fileName}.svg`, `${fileName}.css`);
      const spriteFolder = zip.folder(`${fps}fps`);
      spriteFolder.file(`${fileName}.html`, htmlSprite);
      spriteFolder.file(`${fileName}.css`, cssSprite);
      spriteFolder.file(`${fileName}.svg`, svgSprite);
    });
    zip.generateAsync({ type: 'blob' }).then(content => {
      downloadFile(content, `spritesheet_${vl.name}.zip`);
    });
  }

  exportCssKeyframes() {
    // TODO: implement this
  }

  private getVectorLayer() {
    let vectorLayer: VectorLayer;
    this.store.select(getVectorLayer).first().subscribe(vl => (vectorLayer = vl));
    return vectorLayer;
  }

  private getAnimation() {
    let animation: Animation;
    this.store.select(getAnimation).first().subscribe(anim => (animation = anim));
    return animation;
  }

  private getHiddenLayerIds() {
    let hiddenLayerIds: Set<string>;
    this.store.select(getHiddenLayerIds).first().subscribe(ids => (hiddenLayerIds = ids));
    return hiddenLayerIds;
  }

  private getVectorLayerWithoutHiddenLayers() {
    return LayerUtil.removeLayers(this.getVectorLayer(), ...Array.from(this.getHiddenLayerIds()));
  }

  private getAnimationWithoutHiddenBlocks() {
    const anim = this.getAnimation().clone();
    const hiddenLayerIds = this.getHiddenLayerIds();
    anim.blocks = anim.blocks.filter(b => !hiddenLayerIds.has(b.layerId));
    return anim;
  }
}

function downloadFile(content: string | Blob, fileName: string) {
  const anchor = $('<a>').hide().appendTo(document.body);
  let blob: Blob;
  if (content instanceof Blob) {
    blob = content;
  } else {
    blob = new Blob([content], { type: 'octet/stream' });
  }
  const url = window.URL.createObjectURL(blob);
  anchor.attr({ href: url, download: fileName });
  anchor.get(0).click();
  window.URL.revokeObjectURL(url);
}
