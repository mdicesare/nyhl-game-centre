var g_EventID = {
    NYHL: {
        Standings: 185,
        Schedules: 185,
        Playoffs: 176
    },
    // Add more clients as needed
};


function loadChampionWeenendImage(imageName, container) {
    var extensions = ['jpg', 'png', 'gif', 'jpeg'];
    var found = false;

    for (var i = 0; i < extensions.length; i++) {
        var img = new Image();
        img.src = imageName + '.' + extensions[i];

        img.onload = function () {
            if (!found) {
                found = true;
                $(container).html('<img style="width: 100%;" src="' + this.src + '" alt="Image" />');
            }
        };

        img.onerror = function () {
            // If the image fails to load, do nothing and try the next extension
        };

        if (found) {
            break;
        }
    }
}