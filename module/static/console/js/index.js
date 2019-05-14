var localip;
// NOTE: window.RTCPeerConnection is "not a constructor" in FF22/23
var RTCPeerConnection = /*window.RTCPeerConnection ||*/ window.webkitRTCPeerConnection || window.mozRTCPeerConnection;

if (RTCPeerConnection) (function () {
    var rtc = new RTCPeerConnection({
        iceServers: []
    });
    if (1 || window.mozRTCPeerConnection) { // FF [and now Chrome!] needs a channel/stream to proceed
        rtc.createDataChannel('', {
            reliable: false
        });
    }
    ;

    rtc.onicecandidate = function (evt) {
        // convert the candidate to SDP so we can run it through our general parser
        // see https://twitter.com/lancestout/status/525796175425720320 for details
        if (evt.candidate) grepSDP("a=" + evt.candidate.candidate);
    };
    rtc.createOffer(function (offerDesc) {
        grepSDP(offerDesc.sdp);
        rtc.setLocalDescription(offerDesc);
    }, function (e) {
        console.warn("offer failed", e);
    });


    var addrs = Object.create(null);
    addrs["127.0.0.1"] = false;

    function updateDisplay(newAddr) {
        if (newAddr in addrs) return;
        else addrs[newAddr] = true;
        var displayAddrs = Object.keys(addrs).filter(function (k) {
            return addrs[k];
        });

        localip = window.ip;

        // document.getElementById('list').textContent = displayAddrs.join(" / ") || "n/a";
    }

    function grepSDP(sdp) {
        var hosts = [];
        sdp.split('\r\n').forEach(function (line) { // c.f. http://tools.ietf.org/html/rfc4566#page-39
            if (~line.indexOf("a=candidate")) { // http://tools.ietf.org/html/rfc4566#section-5.13
                var parts = line.split(' '), // http://tools.ietf.org/html/rfc5245#section-15.1
                    addr = parts[4],
                    type = parts[7];
                if (type === 'host') updateDisplay(addr);
            } else if (~line.indexOf("c=")) { // http://tools.ietf.org/html/rfc4566#section-5.7
                var parts = line.split(' '),
                    addr = parts[2];
                updateDisplay(addr);
            }
        });
    }
})();
else {
    document.getElementById('list').innerHTML =
        "<code>ifconfig | grep inet | grep -v inet6 | cut -d\" \" -f2 | tail -n1</code>";
    document.getElementById('list').nextSibling.textContent =
        "In Chrome and Firefox your IP should display automatically, by the power of WebRTCskull.";
}

var ws = null;

function start() {
    updatePageUrl();
    connect(select('.url').value);
}

function ready() {
    select('.connect').style.display = 'block';
    select('.disconnect').style.display = 'none';

    select('.connect').addEventListener('click', function () {
        connect(select('.url').value);
    });
    select('.disconnect').addEventListener('click', function () {
        disconnect();
    });

    select('.url').focus();
    select('.url').addEventListener('keydown', function (ev) {
        var code = ev.which || ev.keyCode;
        // Enter key pressed
        if (code == 13) {
            updatePageUrl();
            connect(select('.url').value);
        }
    });
    select('.url').addEventListener('change', updatePageUrl);

    select('.send-input').addEventListener('keydown', function (ev) {
        var code = ev.which || ev.keyCode;
        // Enter key pressed
        if (code == 13) {
            var msg = select('.send-input').value;
            select('.send-input').value = '';
            send(msg);
        }
        // Up key pressed
        if (code == 38) {
            moveThroughSendHistory(1);
        }
        // Down key pressed
        if (code == 40) {
            moveThroughSendHistory(-1);
        }
    });
    window.addEventListener('popstate', updateWebSocketUrl);


    window.addEventListener('message', function (ev) {
        // You must verify that the origin of the message's sender matches your
        // expectations. In this case, we're only planning on accepting messages
        // from our own origin, so we can simply compare the message event's
        // origin to the location of this document. If we get a message from an
        // unexpected host, ignore the message entirely.
        // if (ev.origin !== (window.location.protocol + "//" + window.location.host))
        //   return;
        // 		function utf8_to_b64( str ) {
        //   return window.btoa(unescape(encodeURIComponent( str )));
        // }
        var mainWindow = ev.source;
        var result = '';
        try {
            ws.send(ev.data);
        } catch (ev) {
            result = 'eval() threw an exception.';
        }


        console.log(result);
    });

    updateWebSocketUrl();
}

function updatePageUrl() {
    var match = select('.url').value.match(new RegExp('^(ws)(s)?://([^/]*)(/.*)$'));
    if (match) {
        var pageUrlSuffix = match[4];
        if (history.state != pageUrlSuffix) {
            history.pushState(pageUrlSuffix, pageUrlSuffix, pageUrlSuffix);
        }
    }
}

function updateWebSocketUrl() {
    var match = location.href.match(new RegExp('^(http)(s)?://([^/]*)(/.*)$'));
    if (match) {
        var wsUrl = 'ws' + (match[2] || '') + '://' + match[3].split(":")[0];
        select('.url').value = wsUrl;
    }
}

function appendMessage(type, data) {
    var template = select('.message.template');
    var el = template.parentElement.insertBefore(template.cloneNode(true), select('.message.type-input'));
    el.classList.remove('template');
    el.classList.add('type-' + type.toLowerCase());
    el.querySelector('.message-type').textContent = type;
    el.querySelector('.message-data').textContent = data || '';
    el.querySelector('.message-data').innerHTML += '&nbsp;';
    el.scrollIntoView(true);
}

function connect(url) {
    function action() {

        function b64_to_utf8(str) {
            return decodeURIComponent(window.atob(str));
        }

        //appendMessage('open', url);
        try {
            ws = new WebSocket(url);
        } catch (ex) {
            //appendMessage('>', 'Cannot connect: ' + ex);
            return;
        }

        select('.connect').style.display = 'none';
        select('.disconnect').style.display = 'block';

        ws.addEventListener('open', function (ev) {
            // appendMessage('onopen');
        });
        ws.addEventListener('close', function (ev) {
            select('.connect').style.display = 'block';
            select('.disconnect').style.display = 'none';
            // appendMessage('>', '[Clean: ' + ev.wasClean + ', Code: ' + ev.code + ', Reason: ' + (ev.reason ||
            //     'none') + ']');
            ws = null;
            select('.url').focus();
        });
        ws.addEventListener('message', function (ev) {

            if (typeof (ev.data) == "object") {
                var rd = new FileReader();
                rd.onload = function (ev) {
                    appendMessage('', "BLOB: " + rd.result);
                };
                rd.readAsBinaryString(ev.data);
            } else {

                if (ev.data) {
                    appendMessage('', b64_to_utf8(ev.data));
                    var postaddr = 'http://' + localip + ':8080/moduleb';
                    window.parent.postMessage(b64_to_utf8(ev.data), postaddr);
                    //console.log(b64_to_utf8(ev.data));

                }


            }
        });

        // Un gestionnaire d'évènement à appeler quand une erreur survient. L'évènement est un évènement de base, nommé "error".
        ws.onerror = function (error) {
            fetch(`http://` + localip + `:8086/console/start/`).then(x => console.log(x));
        };
        ws.addEventListener('error', function (ev) {
            //appendMessage('onerror');
        });

        select('.send-input').focus();
    }

    if (ws) {
        ws.addEventListener('close', function (ev) {
            action();
        });
        disconnect();
    } else {
        action();
    }
}

function disconnect() {
    if (ws) {
        //appendMessage('close');
        ws.close();
    }
}

function send(msg) {
    function b64EncodeUnicode(str) {
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
        }));
    }

    function utf8_to_b64(str) {
        return window.btoa(unescape(encodeURIComponent(str)));
    }

    appendToSendHistory(msg);
    appendMessage('>', msg);
    // samir: Check the amount of buffered data on the client if amount == 0 send it.
    if (ws != null) {
        try {
            ws.send(msg);
        } catch (ex) {
            console.log(ex);
        }
    } else {

        fetch(`http://` + localip + `:8086/console/start/`).then(connect(`ws://`+ localip + `:8095`)).then(x => console.log("La connexion est établie et prête pour la communication.", ws.readyState)).catch(console.log("La connexion est fermée ou n'a pas pu être établie.", 3));
    }
}

function select(selector) {
    return document.querySelector(selector);
}

var maxSendHistorySize = 100;
currentSendHistoryPosition = -1,
    sendHistoryRollback = '';

function appendToSendHistory(msg) {
    currentSendHistoryPosition = -1;
    sendHistoryRollback = '';
    var sendHistory = JSON.parse(localStorage['websocketdconsole.sendhistory'] || '[]');
    if (sendHistory[0] !== msg) {
        sendHistory.unshift(msg);
        while (sendHistory.length > maxSendHistorySize) {
            sendHistory.pop();
        }
        localStorage['websocketdconsole.sendhistory'] = JSON.stringify(sendHistory);
    }
}

function moveThroughSendHistory(offset) {
    if (currentSendHistoryPosition == -1) {
        sendHistoryRollback = select('.send-input').value;
    }
    var sendHistory = JSON.parse(localStorage['websocketdconsole.sendhistory'] || '[]');
    currentSendHistoryPosition += offset;
    currentSendHistoryPosition = Math.max(-1, Math.min(sendHistory.length - 1, currentSendHistoryPosition));

    var el = select('.send-input');
    el.value = currentSendHistoryPosition == -1 ?
        sendHistoryRollback :
        sendHistory[currentSendHistoryPosition];
    setTimeout(function () {
        el.setSelectionRange(el.value.length, el.value.length);
    }, 0);
}

document.addEventListener("DOMContentLoaded", ready, false);