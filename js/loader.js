class Loader {

  constructor() {
    this.xhr = new XMLHttpRequest();
  }

  abort() {
    this.xhr.abort();
  }

  full(url, type, callback) {
    this.xhr.open("GET", url, true);

    this.xhr.responseType = type;
    this.xhr.onreadystatechange = () => {
      if (this.xhr.readyState == XMLHttpRequest.DONE && this.xhr.status == 200) {
        callback(this.xhr.response);
      }
    };

    this.xhr.send();
  }

  range(url, type, callback, begin, end, byteCount) {
    this.xhr.open("GET", url, true);

    this.xhr.setRequestHeader("Range", "bytes=" + (begin * byteCount) + "-" + ((end * byteCount) - 1));
    this.xhr.responseType = type;
    this.xhr.onreadystatechange = () => {
      if (this.xhr.readyState == XMLHttpRequest.DONE && this.xhr.status == 206) {
        callback(this.xhr.response);
      }
    };

    this.xhr.send();
  }

}


class POPLoader extends Loader {

  load(url, init, update) {
    this.full (
        url,
        "json",
        (response) => {
          init(response)
            url = url.substring(0, url.lastIndexOf("/") + 1);

          if(typeof(response.name) === "array") {
            console.log(typeof(response.name));
            this._poprange(url, response, update);
          } else {
            this._popfull(url, response, update);
          }
        }
        );
  }

  _popfull(url, model, update, level = 0) {
    if( level < model.levelCount ) {
      this.full(
        url + model.data[level],
        "arraybuffer",
        (arrayBuffer) => {
          update(arrayBuffer, level);
          setTimeout( () => {
              this._popfull(url, model, update, ++level);
          }, 250 );
        }
      );
    }
  }

  _poprange(url, model, update, level = 0) {
    if(level < model.levelCount) {
      var begin = (level == 0) ? 0 : model.levels[level - 1];
      var end = model.levels[level];
      var byteCount = 12;

      this.range(
          url + model.data,
          "arraybuffer",
          (arrayBuffer) => {
            if (arrayBuffer.byteLength == (end - begin) * byteCount) {
              level++;
            } else {
              level = model.levelCount;
            }

            update(arrayBuffer, level - 1);

            this._poprange(url, model, update, level);
          },
          begin,
          end,
          byteCount
          );
    }
  }

}
