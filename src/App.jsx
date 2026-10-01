import { useState, useEffect, useCallback } from 'react';
import { Tldraw, AssetRecordType, createShapeId } from 'tldraw';
import 'tldraw/tldraw.css';
// 引入 PDF 解析套件
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// 設定 PDF.js 的 Worker (必須)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.mjs`;

export default function App() {
  const [editor, setEditor] = useState(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  
  // 為了測試，我們先寫死讀取 public 資料夾底下的 test.pdf
  const [pdfUrl] = useState('/test.pdf'); 

  // 1. 安全掛載編輯器
  const handleMount = useCallback((editorInstance) => {
    setEditor(editorInstance);
  }, []);

  // 2. PDF 載入與轉換邏輯 (使用低記憶體的 Blob URL)
  const loadPdfIntoTldraw = async (tldrawEditor, url) => {
    setIsLoadingPdf(true);
    try {
      // 讀取並解析 PDF
      const loadingTask = pdfjsLib.getDocument({ url: url });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1); 
      
      // 轉換成畫布 (Canvas)
      const viewport = page.getViewport({ scale: 1.5 }); 
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      
      // 將 Canvas 轉成極輕量的 Blob URL
      const blobUrl = await new Promise((resolve) => {
        canvas.toBlob((blob) => {
          resolve(URL.createObjectURL(blob));
        }, 'image/jpeg', 0.8);
      });

      const myAssetId = AssetRecordType.createId();
      const myShapeId = createShapeId();

      // 建立資源與形狀，貼到 Tldraw 上
      tldrawEditor.createAssets([{
        id: myAssetId, type: 'image', typeName: 'asset',
        props: { 
          w: canvas.width, h: canvas.height, 
          name: 'exam-paper', isAnimated: false, 
          mimeType: 'image/jpeg', src: blobUrl 
        },
        meta: {}, 
      }]);

      tldrawEditor.createShapes([{
        id: myShapeId, type: 'image', x: 0, y: 0, isLocked: true,
        props: { assetId: myAssetId, w: canvas.width, h: canvas.height }, 
        meta: {}, 
      }]);

      // 稍微延遲讓引擎計算體積後，縮放至完美比例
      setTimeout(() => tldrawEditor.zoomToFit(), 200);

    } catch (err) {
      console.error("PDF 載入失敗:", err);
    } finally {
      setIsLoadingPdf(false);
    }
  };

  // 3. 當編輯器準備好時，觸發載入 PDF
  useEffect(() => {
    if (editor && pdfUrl) {
      loadPdfIntoTldraw(editor, pdfUrl);
    }
  }, [editor, pdfUrl]);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {/* 載入中遮罩 */}
      {isLoadingPdf && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)',
          zIndex: 10, display: 'flex', justifyContent: 'center', alignItems: 'center',
          fontSize: '24px', fontWeight: 'bold'
        }}>
          🔄 考卷解析與載入中...
        </div>
      )}
      
      {/* 畫布本體 */}
      <Tldraw onMount={handleMount} />
    </div>
  );
}