'use strict';

var TICKET_TYPES = {PC: 0, CONSOLE: 1};
var TICKET_TYPES_STR = {0: 'BYOC', 1: 'Console'};

var app = angular.module('App', ['angular-loading-bar', 'ngAnimate', 'ngRoute', 'ui.bootstrap', 'angularMoment', 'ngCookies', 'ja.qr'])
  .directive('passwordCheck', [function () {
    return {
      restrict: 'A',
      scope: true,
      require: 'ngModel',
      link: function (scope, elem , attributes, control) {
        var checker = function () {
          var password1 = scope.$eval(attributes.ngModel);
          var password2 = scope.$eval(attributes.passwordCheck);
          return password1 == password2;
        };
        scope.$watch(checker, function (n) {
          control.$setValidity('unique', n);
        });
      }
    }
  }])
  .factory('Auth', function($rootScope, $http) {
    return {
      login: function() {
        $rootScope.loggedIn = true;
        $rootScope.$broadcast('login');
      },
      isLoggedIn: function() {
        return $rootScope.loggedIn;
      },
      logout: function() {
        $rootScope.loggedIn = false;
        $rootScope.$broadcast('login');
      },
      refresh: function() {
        $http.get('/api/login')
          .success(function(data) {
            if (data.commit) {
              $rootScope.staging = true;
              $rootScope.commit = data.commit;
            }
            if (data.logged_in) {
              $rootScope.loggedIn = true;
              $rootScope.$broadcast('login');
            } else {
              $rootScope.loggedIn = false;
            }
          })
          .error(function(err, status) {
            $rootScope.loggedIn = false;
          });
      }
    }
  })
  .factory('Timer', function($rootScope, $interval) {
    return {
      intervalPromise: null,
      timestamp: null,
      /**
       * Timer bootstrap method.
       *
       * To setup and initiate the Timer, call:
       *
       *     Timer.bootstrap($scope, datetime);
       *
       * @param {Scope} $scope Current scope where the Timer is being bootstrap.
       * @param {Date} datetime Date object or string representing a date.
       *
       */
      bootstrap: function($scope, datetime) {
        this.cleanup();
        this.timestamp = moment(datetime).valueOf();

        this.intervalPromise = $interval(function() {
          this.refresh();
        }.bind(this), 100);

        $scope.$on('$destroy', function() {
          this.cleanup();
        }.bind(this));
      },
      refresh: function() {
        var date = this.timestamp - Date.now();

        if (date < 1) {
            $interval.cancel(this.intervalPromise);
            return;
        }

        var minutes = Math.floor(date % 3600000 / 60000);
        var seconds = Math.floor(date % 60000 / 1000);
        seconds = String("00" + seconds).slice(-2);

        $rootScope.timerTime = minutes + ':' + seconds;

        if (minutes < 1) {
          $rootScope.timerTimeDanger = true;
        }
      },
      cleanup: function() {
        $rootScope.timerTime = null;
        $rootScope.timerTimeDanger = null;

        if (this.intervalPromise) {
          $interval.cancel(this.intervalPromise);
        }

        this.intervalPromise = null;
        this.timestamp = null;
      }
    };
  });

app.run(function($rootScope, $http, Auth) {
  // runs on first page load and refresh
  Auth.refresh();
});

app.controller('NavbarController', function($scope, $location, Auth) {
  $scope.isActive = function(url) {
    return $location.path() === url;
  };

  $scope.refresh = function () {
    $scope.loggedIn = Auth.isLoggedIn();
  };

  $scope.$on('login', function() {
    $scope.refresh();
  });

  $('.navbar-nav li a').click(function() {
    if ($('.navbar-collapse.collapse').hasClass('in')) {
      $('#navbar').collapse('hide');
    }
  });
});

app.controller('GamesController', function($scope, $http) {
  $http.get('/games.json')
    .success(function(games) {
      $scope.games = games;
    })
    .error(function(err, status) {
      $scope.error = {message: err.message, status: status};
    });
});

app.controller('TournamentsController', function($scope, $http, $location) {
  function refreshData() {
    $http.get('/tournaments.json')
      .success(function(data) {
        $scope.tournaments = data.tournaments;
      })
      .error(function(err, status) {
        $scope.error = {message: err.message, status: status};
      });

      $http.get('/api/teams')
        .success(function(data) {
          $scope.teams = data.teams;
        })
        .error(function(err, status) {
          $scope.error = {message: err.message, status: status};
        });

      if ($scope.loggedIn) {
        $http.get('/api/profile')
        .success(function(data) {
          $scope.user = data.user;
        })
        .error(function(err, status) {
          $scope.error = {message: err.message, status: status};
        });
      }
  }

  $scope.createTeam = function(_name, _game) {
    var data = {
      game: _game,
      name: _name
    };
    $http.post('/api/teams',data)
      .success(function(data) {
        refreshData();
      })
      .error(function(err, status) {
        $scope.error = {message: err.message, status: status};
      });
  };

  $scope.deleteTeam = function(id, index) {
    if (confirm('Êtes vous certain de vouloir supprimer cette équipe ?')) {
      $http.delete('/api/teams/' + id)
        .success(function(data) {
          $scope.teams.splice(index, 1);
        })
        .error(function(err, status) {
          $scope.error = {message: err.message, status: status};
        });
    }
  };

  refreshData();
});

app.controller('ServersController', function($scope, $http, $interval) {
  $scope.state = {
    loading: true
  };
  $scope.refresh = function() {
    $http.get('/api/servers')
      .success(function(servers) {
        $scope.servers = servers;
        $scope.state.loading = false;
      })
      .error(function(err, status) {
        $scope.error = {message: err.message, status: status};
        $scope.state.loading = false;
      });
  };
  $scope.isEmpty = function(obj) {
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        return false;
      }
    }
    return true;
  };
  $scope.refresh();
  $scope.intervalPromise = $interval(function() {
    $scope.refresh();
  }, 10000);
  $scope.$on('$destroy', function() {
    $interval.cancel($scope.intervalPromise);
  });
});

app.controller('TicketsController', function($scope, $http, $location, Timer) {
  $scope.canBuy = false;
  $scope.max = {
    pc: 96,
    console: 32
  };
  var ticketCounts = {
    'temp': {0: 0, 1: 0},
    'paid': {0: 0, 1: 0}
  };

  if ($scope.loggedIn) {
    $http.get('/api/users/ticket')
      .success(function (data) {
        if (data.ticket && !data.ticket.paid && data.ticket.reserved_until) {
          Timer.bootstrap($scope, data.ticket.reserved_until);
        }
        $scope.canBuy = ($scope.loggedIn && !data.ticket) || ($scope.loggedIn && data.ticket && !data.ticket.paid)
      })
      .error(function (err, status) {
        $scope.error = {message: err.message, status: status};
      });
  }

  $http.get('/api/tickets')
    .success(function(data) {
      var tickets = data.tickets;

      for (var i = 0; i < tickets.length; i++) {
        var ticket = tickets[i];
        var count = ticketCounts['temp'];
        if (ticket.paid) {
          count = ticketCounts['paid'];
        }
        count[ticket.type_id]++;
      }
      $scope.ticketCount = {
        pc: {
          real: ticketCounts['paid'][0],
          temp: ticketCounts['temp'][0],
          total: ticketCounts['paid'][0] + ticketCounts['temp'][0],
          avail: $scope.max.pc - ticketCounts['paid'][0] - ticketCounts['temp'][0]
        },
        console: {
          real: ticketCounts['paid'][1],
          temp: ticketCounts['temp'][1],
          total: ticketCounts['paid'][1] + ticketCounts['temp'][1],
          avail: $scope.max.console - ticketCounts['paid'][1] - ticketCounts['temp'][1]
        }
      };
      $scope.ticketCount.pc.soldout = !($scope.ticketCount.pc.avail > 0);
      $scope.ticketCount.console.soldout = !($scope.ticketCount.console.avail > 0);
    })
    .error(function(err, status) {
      $scope.error = {message: err.message, status: status};
    });

  $scope.buy = function(ticketType) {
    var ticket = {};
    $scope.submitted = true;
    ticket.type = ticketType;

    if (ticketType === TICKET_TYPES.CONSOLE) {
      $http.post('/api/tickets', ticket)
        .success(function(data) {
          $location.path('/pay');
        })
        .error(function(err, status) {
          $scope.error = {message: err.message, status: status};
        });
    } else if (ticketType === TICKET_TYPES.PC) {
      $location.path('/map');
    } else {
      console.log('wrong type id');
    }
  };
});

app.controller('PayController', function($scope, $http, $window, $interval, Timer) {
  $scope.loading = false;

  $http.get('/api/users/ticket')
    .success(function(data) {
      if (data.ticket) {
        $scope.ticket = data.ticket;
        $scope.ticket_type_str = TICKET_TYPES_STR[data.ticket.type_id];
      } else {
        $scope.error = {message: 'Vous n\'avez sélectionné aucun billet.'};
      }
      if (data.ticket && !data.ticket.paid && data.ticket.reserved_until) {
        Timer.bootstrap($scope, data.ticket.reserved_until);
      }
    })
    .error(function(err, status) {
      $scope.error = {message: err.message, status: status};
    });

  $scope.getSeat = function() {
    if ($scope.ticket && $scope.ticket.seat_num) {
      return $scope.ticket.seat_num;
    } else {
      return '-';
    }
  };

  $scope.formatMoney = function(value) {
    return value + ',00$'
  };

  $scope.getTotal = function() {
    if (!$scope.ticket) {
      return 0;
    }
    if ($scope.discountMomo) {
      return $scope.ticket.price - 5;
    }
    return $scope.ticket.price;
  };

  $scope.payNow = function() {
    $scope.loading = true;

    var data = {
      discountMomo: $scope.discountMomo,
      participateGG: $scope.participateGG
    };

    $http.post('/api/tickets/pay', data)
      .success(function(data) {
        $window.location.href = data.redirect_url;
      })
      .error(function(err, status) {
        $scope.loading = false;
        $scope.error = {message: err.message, status: status};
      });
  }
});

app.controller('VerifyController', function($scope, $http, $routeParams) {
  var token = $routeParams.token;

  $http.get('/api/verify/' + token)
    .success(function(data, status) {
      if (data.first) {
        $scope.message = 'Votre compte a bien été créé ! Vous pouvez maintenant vous connecter.';
      } else if (data.first === false) {
        $scope.message = 'Votre compte a déjà été créé ! Vous pouvez vous connecter.';
      } else {
        $scope.error = {message: 'Une erreur est survenue lors de la confirmation de votre compte. Veuillez contacter info@lanmomo.org !'}
      }
    })
    .error(function(data) {
      $scope.error = {message: 'Une erreur est survenue lors de la confirmation de votre compte. Veuillez contacter info@lanmomo.org !'}
    });
});

app.controller('LoginController', function ($scope, $http, $location, $rootScope, Auth) {
  $scope.submitLogin = function () {
    var data = {
        email: $scope.user.email,
        password: $scope.user.password
    };
    $http.post('/api/login', data)
      .success(function(data) {
        Auth.login();
        $location.path('/profile');
      })
      .error(function(err, status) {
        $scope.error = {message: err.message, status: status};
      });
  };
});

app.controller('LogoutController', function ($scope, $http, $location, Auth) {
  $http.get('/api/logout')
    .success(function(data) {
      Auth.logout();
      $location.path('/');
    })
    .error(function(err, status) {
      $scope.error = {message: err.message, status: status};
    });
});

app.controller('ExecuteController', function ($scope, $http, $location, $routeParams) {
  $scope.loading = true;

  var data = {
    'payment_id' : $routeParams.paymentId,
    'payer_id' : $routeParams.PayerID
  };

  $http.put('/api/tickets/pay/execute', data)
    .success(function(data) {
      $scope.loading = false;
      $scope.message = data.message;
    })
    .error(function(err, status) {
      $scope.loading = false;
      $scope.error = {message: err.message, status: status};
    });
});

app.controller('ProfileController', function ($scope, $http) {
  $scope.alerts= [];
  $scope.state = {
    submitted: false,
    loading: false,
    success: false,
    error: false,
    usernameChanged: false,
    emailChanged: false,
    usernameAvailable: false,
    emailAvailable: false,
  };

  $http.get('/api/profile')
    .success(function(data) {
      $scope.userData = data.user;
      $scope.formUser = angular.copy($scope.userData);
      $scope.resetMods();
    })
    .error(function(err, status) {
      $scope.error = {message: err.message, status: status};
    });
  $http.get('/api/users/ticket')
    .success(function(data) {
      if (data.ticket) {
        $scope.userTicket = data.ticket;
        $scope.qrCodeString = 'https://lanmomo.org/qr/' + data.ticket.qr_token;
      }
    })
    .error(function(err, status) {
      $scope.alerts.push({msg: err.message, type: 'danger'});
    });

  $scope.submitUserMods = function () {
    $http.put('/api/users', $scope.formUser)
      .success(function(data) {
        $scope.userData = data.user;
        $scope.resetMods();
        $scope.alerts.push({msg: 'Vos informations ont été mises à jour.', type: 'success'});
      })
      .error(function(err, status) {
        $scope.alerts.push({msg: err.message, type: 'danger'});
      });
  };
  $scope.resetMods = function () {
    $scope.edit = false;
    $scope.formUser = angular.copy($scope.userData);
    $scope.state.emailAvailable = true;
    $scope.state.emailChanged = true;
    $scope.state.usernameAvailable = true;
    $scope.state.usernameChanged = true;
  };
  $scope.isUsernameAvailable = function(user) {
    if (user.username == $scope.userData.username){
      $scope.state.usernameAvailable = true;
      $scope.state.usernameChanged = true;
      return;
    }
    $http.post('/api/users/has/username', {username: user.username})
      .success(function(data) {
        $scope.state.usernameAvailable = !data.exists;
        $scope.state.usernameChanged = true;
      })
      .error(function(data) {
        $scope.state.usernameAvailable = false;
        $scope.state.usernameChanged = true;
      });
  };
  $scope.resetUsernameChanged = function() {
    $scope.state.usernameChanged = false;
  };
  $scope.isEmailAvailable = function(user) {
    if (user.email == $scope.userData.email){
      $scope.state.emailAvailable = true;
      $scope.state.emailChanged = true;
      return;
    }
    $http.post('/api/users/has/email', {email: user.email})
      .success(function(data) {
        $scope.state.emailAvailable = !data.exists;
        $scope.state.emailChanged = true;
      })
      .error(function(data) {
        $scope.state.emailAvailable = false;
        $scope.state.emailChanged = true;
      });
  };
  $scope.resetEmailChanged = function() {
    $scope.state.emailChanged = false;
  };
});

app.controller('QRController', function ($scope, $http, $routeParams) {
  var token = $routeParams.token;
  $scope.ticketTypes = TICKET_TYPES_STR;

  $http.get('/api/qr/' + token)
    .success(function(data) {
      if (data.ticket && data.owner) {
        $scope.ticket = data.ticket;
        $scope.owner = data.owner;
      }
    })
    .error(function(err, status) {
      $scope.error = {message: err.message, status: status};
    });
});


app.controller('SignupController', function($scope, $http, $modal) {
  $scope.state = {
    submitted: false,
    loading: false,
    success: false,
    error: false,
    usernameChanged: false,
    emailChanged: false,
    usernameAvailable: false,
    emailAvailable: false,
  };
  $scope.signup = function(data) {
    $scope.state.loading = true;
    $scope.state.submitted = true;
    $http.post('/api/users', data)
      .success(function(res, status) {
        $scope.message = res.message;
        $scope.state.loading = false;
        $scope.state.success = true;
      })
      .error(function(data) {
        $scope.message = 'Malheureusement, une erreur est survenue lors de votre inscription !' +
          ' Veuillez réessayer plus tard et contacter info@lanmomo.org si le problème persiste.';
        $scope.state.loading = false;
        $scope.state.error = true;
      });
  };
  $scope.isUsernameAvailable = function(user) {
    $http.post('/api/users/has/username', {username: user.username})
      .success(function(data) {
        $scope.state.usernameAvailable = !data.exists;
        $scope.state.usernameChanged = true;
      })
      .error(function(data) {
        $scope.state.usernameAvailable = false;
        $scope.state.usernameChanged = true;
      });
  };
  $scope.resetUsernameChanged = function() {
    $scope.state.usernameChanged = false;
  };
  $scope.isEmailAvailable = function(user) {
    $http.post('/api/users/has/email', {email: user.email})
      .success(function(data) {
        $scope.state.emailAvailable = !data.exists;
        $scope.state.emailChanged = true;
      })
      .error(function(data) {
        console.log(data);
        $scope.state.emailAvailable = false;
        $scope.state.emailChanged = true;
      });
  };
  $scope.resetEmailChanged = function() {
    $scope.state.emailChanged = false;
  };
  $scope.modal = function() {
    var modalInstance = $modal.open({
      controller: 'SignupModalController',
      templateUrl: 'partials/signup-modal.html',
      size: 'lg'
    });
    modalInstance.result.then(function(checked) {
      $scope.checked = checked;
    });
  };

});

app.controller('SignupModalController', function($scope, $modalInstance) {
  $scope.ok = function () {
    $modalInstance.close(true);
  };

  $scope.cancel = function () {
    $modalInstance.close(false);
  };
});

app.controller('MapController', function($scope, $http, $interval, $location, Timer) {
  $scope.canBuy = false;
  $scope.selectedSeat = null;
  $scope.userPaidSeatID = 0;
  $scope.userTicketSeatID = 0;
  var seatStatus = {};
  var seatOwners = {};
  var seatUntils = {};

  $scope.resetSelectedSeat = function() {
    $scope.selectedSeat = false;
    delete $scope.selectedSeatID;
    delete $scope.selectSeatIsFree;
    delete $scope.selectedSeatTicketPaid;
    delete $scope.selectedSeatUser;
    delete $scope.selectedSeatUntil;
    delete $scope.selectedSeatIsUserPaidSeat;
  };
  $scope.isAvail = function(seat) {
    return !seatStatus.hasOwnProperty(seat);
  };
  $scope.isReserved = function(seat) {
    return seatStatus[seat] == 'r';
  };
  $scope.isTaken = function(seat) {
    return seatStatus[seat] == 't';
  };
  $scope.isAlreadyReserved = function(seat) {
    return $scope.userTicketSeatID == seat;
  };
  $scope.getOwner = function(seat) {
    return seatOwners[seat];
  };
  $scope.getUntil = function(seat) {
    return seatUntils[seat];
  };
  $scope.times = function(x) {
    return new Array(x);
  };

  if ($scope.loggedIn) {
    $http.get('/api/users/ticket')
      .success(function (data) {
        if (data.ticket && data.ticket.paid) {
          $scope.userPaidSeatID = data.ticket.seat_num;
        }
        if (data.ticket && !data.ticket.paid) {
          $scope.selectSeat(data.ticket.seat_num);
          $scope.userTicketSeatID = data.ticket.seat_num;
        }
        if (data.ticket && !data.ticket.paid && data.ticket.reserved_until) {
          Timer.bootstrap($scope, data.ticket.reserved_until);
        }
        $scope.canBuy = ($scope.loggedIn && !data.ticket) || ($scope.loggedIn && data.ticket && !data.ticket.paid)
      })
      .error(function (err, status) {
        $scope.error = {message: err.message, status: status};
      });
  }

  $scope.selectSeat = function(seat) {
    $scope.resetSelectedSeat();
    $scope.selectedSeat = true;
    $scope.selectedSeatID = seat;

    if (!$scope.isAvail(seat) && !$scope.isAlreadyReserved(seat)) {
      $scope.selectSeatIsFree = false;
      $scope.selectedSeatTicketPaid = $scope.isTaken(seat);
      $scope.selectedSeatUser = $scope.getOwner(seat);
      $scope.selectedSeatUntil =  $scope.getUntil(seat);

      if ($scope.selectedSeatID == $scope.userPaidSeatID) {
        $scope.selectedSeatIsUserPaidSeat = true;
      }
    } else {
      $scope.selectSeatIsFree = true;
    }
  };

  $scope.buy = function(seat) {
    $scope.submitted = true;

    var ticket = {};
    ticket.type = TICKET_TYPES.PC;
    ticket.seat = seat;

    if ($scope.isAlreadyReserved(seat)) {
      $location.path('/pay');
    } else {
      $http.get('/api/users/ticket')
        .success(function(data) {
          if (data.ticket) {
            $http.put('/api/tickets/seat', ticket)
              .success(function(data) {
                $location.path('/pay');
              })
              .error(function(err, status) {
                $scope.error = {message: err.message, status: status};
              });
          } else {
            $http.post('/api/tickets', ticket)
              .success(function(data) {
                $location.path('/pay');
              })
              .error(function(err, status) {
                $scope.error = {message: err.message, status: status};
              });
          }
        })
        .error(function(err, status) {
          $scope.error = {message: err.message, status: status};
        });
    }
  };

  $scope.refresh = function() {
    $http.get('/api/tickets/type/0')
      .success(function(data) {
        seatStatus = {};
        seatOwners = {};
        seatUntils = {};
        var tickets = data.tickets;
        for (var i = 0; i < tickets.length; i++) {
          var seat = tickets[i].seat_num;
          if (tickets[i].paid) {
            seatStatus[seat] = 't';
          } else {
            seatStatus[seat] = 'r';
          }
          seatOwners[seat] = tickets[i].owner_username;
          seatUntils[seat] = tickets[i].reserved_until;
        }
        if ($scope.selectedSeat) {
          $scope.selectSeat($scope.selectedSeatID);
        }
      })
      .error(function(err, status) {
        $scope.error = {message: err.message, status: status};
      });
  };

  $scope.refresh();
  $scope.intervalPromise = $interval(function() {
    $scope.refresh();
  }, 5000);
  $scope.$on('$destroy', function() {
    $interval.cancel($scope.intervalPromise);
  });
});

app.config(function($routeProvider, $locationProvider, cfpLoadingBarProvider) {
  $routeProvider.when('/', {
    templateUrl: 'partials/home.html'
  })
  .when('/tickets', {
    templateUrl: 'partials/tickets.html',
    controller: 'TicketsController'
  })
  .when('/pay', {
    templateUrl: 'partials/pay.html',
    controller: 'PayController'
  })
  .when('/pay/execute', {
    templateUrl: 'partials/execute.html',
    controller: 'ExecuteController'
  })
  .when('/map', {
    templateUrl: 'partials/map.html',
    controller: 'MapController'
  })
  .when('/games', {
    templateUrl: 'partials/games.html',
    controller: 'GamesController'
  })
  .when('/tournaments', {
    templateUrl: 'partials/tournaments.html',
    controller: 'TournamentsController'
  })
  .when('/servers', {
    templateUrl: 'partials/servers.html',
    controller: 'ServersController'
  })
  .when('/about', {
    templateUrl: 'partials/about.html'
  })
  .when('/terms', {
    templateUrl: 'partials/terms.html'
  })
  .when('/faq', {
    templateUrl: 'partials/faq.html'
  })
  .when('/contact', {
    templateUrl: 'partials/contact.html'
  })
  .when('/signup', {
    templateUrl: 'partials/signup.html',
    controller: 'SignupController'
  })
  .when('/profile', {
    templateUrl: 'partials/profile.html',
    controller: 'ProfileController'
  })
  .when('/login', {
    templateUrl: 'partials/login.html',
    controller: 'LoginController'
  })
  .when('/logout', {
    templateUrl: 'partials/home.html',
    controller: 'LogoutController'
  })
  .when('/verify/:token', {
    templateUrl: 'partials/verify.html',
    controller: 'VerifyController'
  })
  .when('/qr/:token', {
    templateUrl: 'partials/qr.html',
    controller: 'QRController'
  });

  $routeProvider.otherwise({redirectTo: '/'});

  $locationProvider.html5Mode(true);

  cfpLoadingBarProvider.includeSpinner = false;

  moment.locale('fr-ca');
});

app.filter('capitalize', function() {
  return function(input) {
    return input.substring(0, 1).toUpperCase() + input.substring(1);
  };
});
