import React from 'react';
import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';

// 🕸️ 錯誤捕捉網：專門用來攔截 Tldraw 隱藏的崩潰錯誤
class ErrorCatcher extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  
  // 當底層的 Tldraw 崩潰時，React 會觸發這個函數
  componentDidCatch(error, errorInfo) {
    this.setState({ hasError: true, error: error, errorInfo: errorInfo });
  }

  render() {
    if (this.state.hasError) {
      // 發生崩潰時，不要變白，而是變成大紅色並印出詳細死因
      return (
        <div style={{ padding: '20px', background: '#ffebee', color: '#c62828', height: '100vh', boxSizing: 'border-box', overflow: 'auto' }}>
          <h2>🚨 抓到崩潰元兇了！請複製以下文字給我：</h2>
          
          <h3 style={{ marginTop: '20px' }}>【錯誤訊息】</h3>
          <p style={{ fontWeight: 'bold', fontSize: '18px', background: 'white', padding: '10px' }}>
            {this.state.error && this.state.error.toString()}
          </p>
          
          <h3 style={{ marginTop: '20px' }}>【錯誤追蹤碼 (Stack)】</h3>
          <pre style={{ background: '#ffcdd2', padding: '15px', borderRadius: '8px', overflowX: 'auto', lineHeight: '1.5' }}>
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// 主程式：把 Tldraw 關在捕捉網裡面
export default function App() {
  return (
    // 底色設定為深灰色，如果 Tldraw 消失且沒報錯，畫面會是深灰色而不是白色
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#333333' }}>
      <ErrorCatcher>
        <Tldraw />
      </ErrorCatcher>
    </div>
  );
}