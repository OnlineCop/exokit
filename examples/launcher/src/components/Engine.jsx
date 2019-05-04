import React from 'react';
import Dom from './Dom';
import Console from './Console';
import '../css/engine.css';

class Engine extends React.Component {

    constructor(props) {
      super(props);
      this.postMessage = this.postMessage.bind(this);
      this.setFlag = this.setFlag.bind(this);
      this.handleURLChange = this.handleURLChange.bind(this);
      this.state = {
        flags: [],
        url: 'https://aframe.io/a-painter/',
      };
    }
    
    componentDidMount() {
      const engineRender = document.getElementById('engine-render');

      const _postViewportMessage = () => {
        const bcr = engineRender.getBoundingClientRect();
        const viewport = [bcr.x/window.innerWidth, bcr.y/window.innerHeight, bcr.width/window.innerWidth, bcr.height/window.innerHeight];
        window.postMessage({
          method: 'viewport',
          viewport,
        });
      };
      _postViewportMessage();
      window.addEventListener('resize', _postViewportMessage);
      
      window.addEventListener('keydown', e => {
        console.log('iframe keydown ' + e.keyCode);
      });
      window.addEventListener('keyup', e => {
        console.log('iframe keyup ' + e.keyCode);
      });
      window.addEventListener('keypress', e => {
        console.log('iframe keypress ' + e.keyCode);
      });
    }

    postMessage(action){
      window.postMessage({
        action: action,
        flags: this.state.flags,
        url: this.state.url
      });
    }

    handleURLChange(e){
      this.setState({
        url: e.target.value
      });
    }

    setFlag(e){
      let flag = e.target.value;
      if (!this.state.flags.includes(flag)) {
        this.state.flags.push(flag)
      } else {
        this.state.flags.splice(this.state.flags.indexOf(flag), 1);
      }
    }
    
    menuItemClassNames(item) {
      const classNames = ['menu-item'];
      if (item === this.state.item) {
        classNames.push('open');
      }
      return classNames.join(' ');
    }
    
    menuItemPopupClassNames(item) {
      const classNames = ['menu-item-popup'];
      if (item === this.state.item) {
        classNames.push('open');
      }
      return classNames.join(' ');
    }
    
    urlPopupClassNames() {
      const classNames = ['url-popup'];
      if (this.state.urlFocus) {
        classNames.push('open');
      }
      return classNames.join(' ');
    }
    
    openMenu(item) {
      const open = this.state.item !== item;
      this.setState({item: open ? item : null}, () => {
        this.postMenuStatus();
      });
    }
    
    focusUrlInput() {
      this.setState({
        item: null,
        urlFocus: true,
      }, () => {
        this.postMenuStatus();
      });
    }
    
    blurUrlInput() {
      this.setState({urlFocus: false}, () => {
        this.postMenuStatus();
      });
    }
    
    onUrlChange(e) {
      console.log('url change', e.target.value);
      this.setState({
        url: e.target.value,
      });
    }

    open3dTab() {
      const urlInput = document.getElementById('url-input');
      const url = urlInput.value;

      window.postMessage({
        method: 'open',
        url,
        d: 3,
      });

      this.blur();
    }

    open2dTab() {
      const urlInput = document.getElementById('url-input');
      const url = urlInput.value;

      window.postMessage({
        method: 'open',
        url,
        d: 2,
      });

      this.blur();
    }

    onFakeXrClick() {
      window.postMessage({
        method: 'click',
        target: 'fakeXr',
      });
      
      this.blur();
    }
    
    onXrClick() {
      window.postMessage({
        method: 'click',
        target: 'xr',
      });
    }

    onTransformClick() {
      window.postMessage({
        method: 'click',
        target: 'transform',
      });
    }

    blur() {
      this.setState({
        item: null,
        urlFocus: false,
      }, () => {
        this.postMenuStatus();
      });
    }
    
    postMenuStatus() {
      window.postMessage({
        method: 'menu',
        open: this.state.urlFocus || this.state.item !== null,
      });
    }

    render() {
      return (
        <div id="Engine">
          <div className="row menu">
            <div className={this.menuItemClassNames('file')} onClick={() => this.openMenu('file')}>
              <div className={this.menuItemPopupClassNames('file')}>
                <div className="menu-item-popup-item">
                  New A-Frame...
                </div>
              </div>
              <div>File</div>
            </div>
            <div className={this.menuItemClassNames('tabs')}onClick={() => this.openMenu('tabs')}>
              <div className={this.menuItemPopupClassNames('tabs')}>
                <div className="menu-item-popup-item">
                  New example...
                  Import...
                  Export...
                </div>
              </div>
              <div>Tabs</div>
            </div>
            {/* <div className={this.menuItemClassNames('export')} onClick={() => this.openMenu('export')}>
              <div className={this.menuItemPopupClassNames('export')}>
                <div className="menu-item-popup-item">
                  New A-Frame...
                </div>
              </div>
              <div>Export</div>
            </div> */}
            <div className={this.menuItemClassNames('about')} onClick={() => this.openMenu('about')}>
              <div className={this.menuItemPopupClassNames('about')}>
                <div className="menu-item-popup-item">
                  New A-Frame...
                </div>
              </div>
              <div>About</div>
            </div>
            <div className="url">
              <div className={this.urlPopupClassNames()}>
                <div className="url-item" onMouseDown={e => e.preventDefault()} onClick={() => this.open3dTab()}>3D Reality Tab</div>
                <div className="url-item" onMouseDown={e => e.preventDefault()} onClick={() => this.open2dTab()}>2D Reality Tab</div>
              </div>
              <input type="text" className="url-input" id="url-input" value={this.state.url} onChange={e => this.onUrlChange(e)} onFocus={() => this.focusUrlInput()} onBlur={() => this.blurUrlInput()}/>
            </div>
            <div className="buttons">
              <div className="button" onClick={() => this.onXrClick()}>
                <i class="fas fa-head-vr"></i>
                <div className="label">Enter XR</div>
              </div>
              <div className="button" onClick={() => this.onFakeXrClick()}>
                <i class="fal fa-vr-cardboard"></i>
                <div className="label">Fake XR</div>
              </div>
              <div className="button" onClick={() => this.onTransformClick()}>
                <i className="fal fa-arrows"></i>
                <div className="label">Transform</div>
              </div>
            </div>
          </div>
          <div className="engine-split">
            <div className="engine-left">
              <div className="engine-render" id="engine-render"/>
              <Console/>
            </div>
            <div className="engine-right">
              <Dom/>
            </div>
          </div>
        </div>
      );
    }
  }

  export default Engine;