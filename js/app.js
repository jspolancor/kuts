var self;
const Store = require('electron-store');
const store = new Store();
const ipc = require('electron').ipcRenderer
const savedLanguage = localStorage.getItem('app-language');
const showNotifications = localStorage.getItem('show-notifications');
if(!savedLanguage) localStorage.setItem('app-language', 'en');
if(!showNotifications) localStorage.setItem('show-notifications', 1);

const i18n = new VueI18n({
  locale: localStorage.getItem('app-language'), 
  messages
});

Vue.use(VeeValidate);

var app = new Vue({
  i18n: i18n,
  el: '#app',
  data: {
    showConfig: false,
    user: null,
    trialVersion: true,
    email: '',
    password: '',
    file: '',
    authLoading: true,
    doingAuth: false,
    showLoader: true,
    selectedFile: '',
    jumpcuts: true,
    jumpcutType: 'raw',
    addSound: false,
    selectedSound: '',
    processingVideo: false,
    analysisProgress: 0,
    trimProgress: 0,
    levelsProgress: 0,
    watermarkProgress: 0,
    silenceTime: 1000,
    decibels: 11,
    breathing: 200,
    processedFile: '',
    languages: [{ value: 'en', name: 'English' }, { value: 'es', name: 'Español' }],
    feedback: '',
    language: '',
    showNotifications: false,    
    database: null,
    plan: 1,
    tab: 1,
    showCutsHelp: false,
    analysisCommand: '',
    trimCommand: '',
    levelsCommand: '',
    showUpdateInstall: false,
  },
  created() {   
    self = this;
    self.language = localStorage.getItem('app-language');
    self.showNotifications = localStorage.getItem('show-notifications');
    self.initializeFirebase();
    // Show loader at least one and a half seconds
    setTimeout(function(){
      self.showLoader = false;      
    }, 1500);

    ipc.on('selected-file', function (event, path) {      
      self.tab = 1;     
      self.processedFile = '';
      self.selectedFile = path[0];         
    });

    ipc.on('selected-sound', function (event, path) {      
      self.selectedSound = path[0];  
    });

    ipc.on('message', function (event, res) {              
      switch(res.message){
        case 'update downloaded':
          if(self.showNotifications){
            new Notification(self.$t('app.notificationTitle'), {
              body: self.$t('app.updateDownloaded')
            });
          }   
          self.showUpdateInstall = true;
        break;
        case 'analysis started':
          self.analysisCommand = res;
        break;
        case 'trim started':
          self.trimCommand = res;
        break;
        case 'levels started':
          self.levelsCommand = res;
        break;
        case 'analysis progress':
          const splittedTime = res.data.timemark.split(':');
          const hours = parseInt(splittedTime[0]) * 3600;
          const minutes = parseInt(splittedTime[1]) * 60;
          const seconds = parseFloat(splittedTime[2]);
          const currentAnalysisTime = hours + minutes + seconds;
          const currentAnalysis = currentAnalysisTime * 100 / document.querySelector('video').duration;
          self.analysisProgress = parseInt(currentAnalysis);                    
        break;
        case 'analysis ended':
          self.analysisProgress = 100;
        break;
        case 'trim progress':
        if(!isNaN(res.data.percent)){
          self.trimProgress = parseInt(res.data.percent);          
        }          
        break;
        case 'levels progress':
        if(!isNaN(res.data.percent)){
          self.levelsProgress = parseInt(res.data.percent);          
        }  
        break;
        case 'levels ended':
          self.levelsProgress = 100;
        break;
        case 'trim ended':
          self.trimProgress = 100;
        break;
        case 'trim errored':
          ipc.send('open-error-dialog', self.$t('messages.error'), self.$t('app.trimErrored'));
          self.trimProgress = 0;
          self.analysisProgress = 0;
          self.watermarkProgress = 0;
          self.levelsProgress = 0;
          self.processingVideo = false;

          self.database
          .ref('error-logs/').push({
            error: 'Trim error',
            err: res,
            command: self.trimCommand,
            u: self.user.uid,
          });
        break;
        case 'analysis errored':
          ipc.send('open-error-dialog', self.$t('messages.error'), self.$t('app.analysisErrored'));
          self.trimProgress = 0;
          self.analysisProgress = 0;
          self.watermarkProgress = 0;
          self.processingVideo = false;
          self.levelsProgress = 0;

          self.database
          .ref('error-logs/').push({
            error: 'Analysis error',
            err: res,
            command: self.analysisCommand,
            u: self.user.uid,
          });
        break;
        case 'levels errored':
          ipc.send('open-error-dialog', self.$t('messages.error'), self.$t('app.levelsErrored'));
          self.trimProgress = 0;
          self.analysisProgress = 0;
          self.watermarkProgress = 0;
          self.levelsProgress = 0;
          self.processingVideo = false;

          self.database
          .ref('error-logs/').push({
            error: 'Levels error',
            err: res,
            command: self.levelsCommand,
            u: self.user.uid,
          });
        break;
        case 'watermark progress':
          self.watermarkProgress = parseInt(res.data.percent);          
        break;    
        case 'watermark ended':
          self.watermarkProgress = 100;
        break;        
        case 'all ended':
        self.processedFile = res.data;
        self.trimProgress = 0;
        self.analysisProgress = 0;
        self.watermarkProgress = 0;
        self.processingVideo = false;
        self.levelsProgress = 0;
        self.tab = 2;
        if(self.showNotifications){
          new Notification(self.$t('app.notificationTitle'), {
            body: self.$t('app.videoProcessed')
          });
        }        
        break;
      }          
    });    
  },
  methods: {
    quitAndInstall(){      
      ipc.send('quit-and-install');
    },
    initializeFirebase() {
      // Initialize Firebase
      var config = {
        apiKey: 'AIzaSyDiPv_-L153gtZU_VWx6OTudrxfW3fhHLo',
        authDomain: 'olcms-db142.firebaseapp.com',
        databaseURL: 'https://olcms-db142.firebaseio.com',
        projectId: 'olcms-db142',
        storageBucket: 'olcms-db142.appspot.com',
        messagingSenderId: '210448599470'
      };
      firebase.initializeApp(config);
      self.database = firebase.database();
      firebase.auth().onAuthStateChanged(function(user) {        
        if (user) {

          const database = firebase.database();

          database
          .ref('subscriptions/' + user.uid)
          .once('value')
          .then(snapshot => {
            store.set('u', {
              uid: user.uid,
              user: user.email,
              plan: snapshot.val().currentPlan,
            });
            ipc.send('save-current-user');            
            self.user = {
              uid: user.uid,
              user: user.email,
              plan: snapshot.val().currentPlan,
            };  
            self.authLoading = false;
            self.doingAuth = false;
          })
          .catch(() => {
            store.set('u', {
              uid: user.uid,
              user: user.email,
              plan: null,
            });  
            ipc.send('save-current-user');             
            self.authLoading = false;
            self.doingAuth = false;
            self.user = {
              uid: user.uid,
              user: user.email,
              plan: null,
            };          
          });          
        }else{
          store.set('u', null);    
          self.authLoading = false;
          self.doingAuth = false;   
          self.showConfig = false;
          self.user = null;
        }
      });
    },
    login() {
      self.doingAuth = true;
      firebase
        .auth()
        .signInWithEmailAndPassword(self.email, self.password)
        .catch(function(error) {
          self.doingAuth = false;
          var errorCode = error.code;
          var errorMessage = error.message;
          if(errorCode == 'auth/user-not-found'){
            ipc.send('open-error-dialog', self.$t('messages.error'), self.$t('login.notUser'));
          }else{
            ipc.send('open-error-dialog', self.$t('messages.error'), self.$t('login.badCredentials'));
          }          
        });
    },
    logout() {
      self.doingAuth = true;      
      self.tab = 1;     
      self.processedFile = '';
      firebase
        .auth()
        .signOut()
        .then(function() {})
        .catch(function(error) {
          ipc.send('open-error-dialog', self.$t('messages.error'), '');
        });
    },
    onSubmit() {
      self.$validator.validateAll();

      if (!self.errors.any()) {
        self.login();
      }
    },
    selectFile(){
      ipc.send('open-file-dialog');
    },
    selectSound(){      
      ipc.send('open-sound-dialog');
    },
    processVideo(){      
      self.tab = 1;
      self.processedFile = '';
      self.processingVideo = true;
      setTimeout(() => {
        document.querySelector('.video-area').scrollTo(0, 700)
      }, 500);            
      ipc.send(
        'process-video', 
        this.selectedFile, 
        this.selectedSound, 
        this.jumpcuts, 
        this.silenceTime / 1000,
        this.decibels,
        this.breathing / 1000,
      );      
    },
    cancelProcess(){
      ipc.send('cancel-process');
      self.processingVideo = false;
      self.analysisProgress = 0;
      self.trimProgress = 0;
      self.watermarkProgress = 0;
      self.levelsProgress = 0;
    },
    openForgotPassword() {
      ipc.send('open-link', `https://kuts.io/${self.language}?passwordreset=true`);
    },
    openUpgrade() {
      ipc.send('open-link', `https://kuts.io/${self.language}/account`);
    },
    openSignUp() {
      ipc.send('open-link', `https://kuts.io/${self.language}?signup=true`);
    },
    openFile(file){
      ipc.send('open-file', file);
    },
    changeLanguage(){
      i18n.locale = self.language;
      localStorage.setItem('app-language', self.language);
    },
    changeNotificationSettings(){      
      localStorage.setItem('show-notifications', self.showNotifications);
    },
    sendFeedback(){      
      self.database.ref('feedback/').push({        
        email: self.user.user,
        feedback : self.feedback,
      });
      self.feedback = '';
      ipc.send('open-info-dialog', self.$t('messages.thanks'), self.$t('messages.feedbackThanks'));
    },
    restoreDefaults(){
      self.silenceTime = 1000;
      self.decibels = 11;
      self.breathing = 200;
    }
  }
}).$mount('#app');
