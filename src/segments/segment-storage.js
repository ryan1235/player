const fs = require('fs');
const { atomicWriteFileSync } = require('../services/atomic-write');

class SegmentStorage {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this._load();
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch {
      return {};
    }
  }

  _persist() {
    try {
      atomicWriteFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch {
      // silencioso se falhar, igual aos outros modulos (nao impacta a aplicacao)
    }
  }

  getVideoEntry(videoId) {
    return this.data[videoId] || null;
  }

  setVideoEntry(videoId, entry) {
    this.data[videoId] = entry;
    this._persist();
  }

  addSegment(videoId, videoName, duration, segment) {
    let entry = this.getVideoEntry(videoId);
    if (!entry) {
      entry = {
        videoId,
        name: videoName,
        size: 0, // omitido por simplicidade
        duration: duration || 0,
        segments: []
      };
    }
    
    // Assegura que o segmento tem id e data
    if (!segment.id) {
      segment.id = 'seg_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    }
    if (!segment.createdAt) {
      segment.createdAt = Date.now();
    }
    
    entry.segments.push(segment);
    this.setVideoEntry(videoId, entry);
    return segment;
  }

  updateSegment(videoId, segmentId, updates) {
    const entry = this.getVideoEntry(videoId);
    if (!entry || !entry.segments) return null;

    const idx = entry.segments.findIndex(s => s.id === segmentId);
    if (idx === -1) return null;

    entry.segments[idx] = { ...entry.segments[idx], ...updates };
    this.setVideoEntry(videoId, entry);
    return entry.segments[idx];
  }

  deleteSegment(videoId, segmentId) {
    const entry = this.getVideoEntry(videoId);
    if (!entry || !entry.segments) return false;

    const initialLength = entry.segments.length;
    entry.segments = entry.segments.filter(s => s.id !== segmentId);
    
    if (entry.segments.length !== initialLength) {
      this.setVideoEntry(videoId, entry);
      return true;
    }
    return false;
  }

  getSegments(videoId) {
    const entry = this.getVideoEntry(videoId);
    return entry ? entry.segments || [] : [];
  }

  getEnabledSegments(videoId) {
    const segments = this.getSegments(videoId);
    return segments.filter(s => s.enabled !== false);
  }

  toggleSegment(videoId, segmentId, enabled) {
    return this.updateSegment(videoId, segmentId, { enabled });
  }

  getAllVideoIds() {
    return Object.keys(this.data);
  }
}

module.exports = SegmentStorage;
