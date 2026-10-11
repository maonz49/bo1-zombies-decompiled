#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
#import <AVFoundation/AVFoundation.h>

static NSString *const BO1URL = @"https://bo1.znoam.eu/bo1z/kino-mobile-20261011.html?telemetry=0&packOrigin=0&touch=1&quality=eco&renderer=webgl2";
static NSString *const ReportKey = @"BO1LastLaunchReport";

@interface GameController : UIViewController <WKNavigationDelegate, WKScriptMessageHandler>
@property(nonatomic, strong) WKWebView *webView;
@property(nonatomic, strong) UIButton *menuButton;
@property(nonatomic, strong) NSMutableArray<NSString *> *lines;
@property(nonatomic, strong) NSMutableArray<NSString *> *memorySamples;
@property(nonatomic, copy) NSString *patchStatus;
@property(nonatomic, copy) NSString *capabilities;
@property(nonatomic, strong) UIStackView *panel;
- (void)appendLog:(NSString *)line;
- (void)saveReport;
- (void)stopWithReason:(NSString *)reason;
@end

@implementation GameController
- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [UIColor colorWithWhite:0.045 alpha:1];
    self.lines = [NSMutableArray array];
    self.memorySamples = [NSMutableArray array];
    [self showHome:@"Kino der Toten • Profil mémoire 0.2"];
}
- (BOOL)prefersStatusBarHidden { return YES; }
- (BOOL)prefersHomeIndicatorAutoHidden { return self.webView != nil; }
- (UIRectEdge)preferredScreenEdgesDeferringSystemGestures { return UIRectEdgeAll; }
- (UIInterfaceOrientationMask)supportedInterfaceOrientations { return UIInterfaceOrientationMaskLandscape; }
- (UILabel *)label:(NSString *)text size:(CGFloat)size color:(UIColor *)color {
    UILabel *label = [UILabel new];
    label.text = text;
    label.font = [UIFont systemFontOfSize:size weight:size >= 28 ? UIFontWeightHeavy : UIFontWeightRegular];
    label.textColor = color;
    label.textAlignment = NSTextAlignmentCenter;
    label.numberOfLines = 0;
    return label;
}
- (UIButton *)button:(NSString *)title action:(SEL)action primary:(BOOL)primary {
    UIButtonConfiguration *configuration = primary ? [UIButtonConfiguration filledButtonConfiguration] : [UIButtonConfiguration grayButtonConfiguration];
    configuration.title = title;
    configuration.baseBackgroundColor = primary ? [UIColor colorWithRed:0.72 green:0.18 blue:0.13 alpha:1] : [UIColor colorWithWhite:0.14 alpha:1];
    configuration.baseForegroundColor = UIColor.whiteColor;
    configuration.contentInsets = NSDirectionalEdgeInsetsMake(13, 24, 13, 24);
    configuration.cornerStyle = UIButtonConfigurationCornerStyleMedium;
    UIButton *button = [UIButton buttonWithConfiguration:configuration primaryAction:nil];
    [button addTarget:self action:action forControlEvents:UIControlEventTouchUpInside];
    return button;
}
- (void)showHome:(NSString *)message {
    [self.panel removeFromSuperview];
    UILabel *title = [self label:@"BO1 ZOMBIES" size:34 color:UIColor.whiteColor];
    UILabel *subtitle = [self label:message size:16 color:[UIColor colorWithWhite:0.78 alpha:1]];
    UILabel *note = [self label:@"Version de test · Internet requis\nLe premier lancement télécharge les fichiers du jeu." size:12 color:UIColor.grayColor];
    self.panel = [[UIStackView alloc] initWithArrangedSubviews:@[title, subtitle, [self button:@"Jouer" action:@selector(startGame) primary:YES], [self button:@"Partager le diagnostic" action:@selector(shareReport) primary:NO], note]];
    self.panel.axis = UILayoutConstraintAxisVertical;
    self.panel.spacing = 14;
    self.panel.alignment = UIStackViewAlignmentCenter;
    self.panel.translatesAutoresizingMaskIntoConstraints = NO;
    [self.view addSubview:self.panel];
    [NSLayoutConstraint activateConstraints:@[
        [self.panel.centerXAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.centerXAnchor],
        [self.panel.centerYAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.centerYAnchor],
        [self.panel.widthAnchor constraintLessThanOrEqualToAnchor:self.view.safeAreaLayoutGuide.widthAnchor multiplier:0.94],
        [self.panel.widthAnchor constraintLessThanOrEqualToConstant:620]
    ]];
    [self setNeedsUpdateOfHomeIndicatorAutoHidden];
}
- (void)appendLog:(NSString *)line {
    if (line.length > 800) line = [line substringToIndex:800];
    [self.lines addObject:[NSString stringWithFormat:@"%@: %@", NSDate.date.description, line]];
    while (self.lines.count > 100) [self.lines removeObjectAtIndex:0];
}
- (void)saveReport {
    NSString *report = [NSString stringWithFormat:@"BO1 Mobile 0.2 — application WebKit expérimentale\niOS %@\n%@\nCorrectif : %@\nCapacités : %@\n\nMémoire du moteur (compteurs internes, pas la mémoire résidente iOS) :\n%@\n\nConsole :\n%@", UIDevice.currentDevice.systemVersion, BO1URL, self.patchStatus ?: @"non chargé", self.capabilities ?: @"non reçues", [self.memorySamples componentsJoinedByString:@"\n"], [self.lines componentsJoinedByString:@"\n"]];
    [NSUserDefaults.standardUserDefaults setObject:report forKey:ReportKey];
}
- (void)startGame {
    if (self.webView) return;
    [self.lines removeAllObjects];
    [self.memorySamples removeAllObjects];
    self.patchStatus = nil;
    self.capabilities = nil;
    [self appendLog:@"Démarrage demandé — qualité éco, WebGL2, interface tactile."];
    [self saveReport];
    NSString *scriptPath = [NSBundle.mainBundle pathForResource:@"Diagnostics" ofType:@"js"];
    NSError *scriptError = nil;
    NSString *script = [NSString stringWithContentsOfFile:scriptPath encoding:NSUTF8StringEncoding error:&scriptError];
    if (!script) { [self stopWithReason:@"Le module de diagnostic manque dans cette application."]; return; }
    NSString *patchPath = [NSBundle.mainBundle pathForResource:@"MemoryPatch" ofType:@"js"];
    NSString *patch = [NSString stringWithContentsOfFile:patchPath encoding:NSUTF8StringEncoding error:&scriptError];
    if (!patch) { [self stopWithReason:@"Le correctif mémoire manque dans cette application."]; return; }
    [self.panel removeFromSuperview];
    self.panel = nil;
    WKWebViewConfiguration *config = [WKWebViewConfiguration new];
    config.websiteDataStore = WKWebsiteDataStore.defaultDataStore;
    config.allowsInlineMediaPlayback = YES;
    config.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;
    config.limitsNavigationsToAppBoundDomains = YES;
    config.applicationNameForUserAgent = @"BO1Mobile/0.2";
    [config.userContentController addScriptMessageHandler:self name:@"bo1"];
    [config.userContentController addUserScript:[[WKUserScript alloc] initWithSource:script injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES]];
    [config.userContentController addUserScript:[[WKUserScript alloc] initWithSource:patch injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES]];
    self.webView = [[WKWebView alloc] initWithFrame:self.view.bounds configuration:config];
    self.webView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    self.webView.navigationDelegate = self;
    self.webView.opaque = NO;
    self.webView.backgroundColor = UIColor.blackColor;
    self.webView.scrollView.backgroundColor = UIColor.blackColor;
    self.webView.scrollView.bounces = NO;
    self.webView.scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
    self.webView.allowsBackForwardNavigationGestures = NO;
    self.webView.inspectable = YES;
    [self.view addSubview:self.webView];
    self.menuButton = [self button:@"•••" action:@selector(showMenu) primary:NO];
    self.menuButton.accessibilityLabel = @"Menu du jeu";
    self.menuButton.translatesAutoresizingMaskIntoConstraints = NO;
    [self.view addSubview:self.menuButton];
    [NSLayoutConstraint activateConstraints:@[
        [self.menuButton.trailingAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.trailingAnchor constant:-8],
        [self.menuButton.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor constant:8],
        [self.menuButton.heightAnchor constraintEqualToConstant:44]
    ]];
    NSError *audioError = nil;
    [AVAudioSession.sharedInstance setCategory:AVAudioSessionCategoryPlayback error:&audioError];
    if (audioError) [self appendLog:audioError.localizedDescription];
    UIApplication.sharedApplication.idleTimerDisabled = YES;
    [self setNeedsUpdateOfHomeIndicatorAutoHidden];
    [self.webView loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:BO1URL] cachePolicy:NSURLRequestUseProtocolCachePolicy timeoutInterval:60]];
}
- (void)releaseGame {
    UIApplication.sharedApplication.idleTimerDisabled = NO;
    [self.webView stopLoading];
    [self.webView.configuration.userContentController removeScriptMessageHandlerForName:@"bo1"];
    self.webView.navigationDelegate = nil;
    [self.webView removeFromSuperview];
    self.webView = nil;
    [self.menuButton removeFromSuperview];
    self.menuButton = nil;
}
- (void)stopWithReason:(NSString *)reason {
    [self appendLog:reason];
    [self saveReport];
    [self releaseGame];
    if (self.presentedViewController) [self dismissViewControllerAnimated:NO completion:nil];
    [self showHome:reason];
}
- (void)showMenu {
    UIAlertController *menu = [UIAlertController alertControllerWithTitle:@"BO1 Zombies" message:nil preferredStyle:UIAlertControllerStyleActionSheet];
    __weak GameController *weakSelf = self;
    [menu addAction:[UIAlertAction actionWithTitle:@"Partager le diagnostic" style:UIAlertActionStyleDefault handler:^(UIAlertAction *action) { [weakSelf shareReport]; }]];
    [menu addAction:[UIAlertAction actionWithTitle:@"Quitter la partie" style:UIAlertActionStyleDestructive handler:^(UIAlertAction *action) { [weakSelf stopWithReason:@"Partie fermée."]; }]];
    [menu addAction:[UIAlertAction actionWithTitle:@"Continuer" style:UIAlertActionStyleCancel handler:nil]];
    menu.popoverPresentationController.sourceView = self.menuButton;
    menu.popoverPresentationController.sourceRect = self.menuButton.bounds;
    [self presentViewController:menu animated:YES completion:nil];
}
- (void)shareReport {
    NSString *report = [NSUserDefaults.standardUserDefaults stringForKey:ReportKey] ?: @"Aucun lancement enregistré.";
    UIActivityViewController *share = [[UIActivityViewController alloc] initWithActivityItems:@[report] applicationActivities:nil];
    share.popoverPresentationController.sourceView = self.view;
    share.popoverPresentationController.sourceRect = CGRectMake(CGRectGetMidX(self.view.bounds), CGRectGetMidY(self.view.bounds), 1, 1);
    [self presentViewController:share animated:YES completion:nil];
}
- (void)webViewWebContentProcessDidTerminate:(WKWebView *)webView {
    if (webView != self.webView) return;
    [self stopWithReason:@"Le moteur web s’est arrêté. Le diagnostic a été conservé. La cause exacte nécessite les journaux iOS."];
}
- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    if (error.code != NSURLErrorCancelled && webView == self.webView) [self stopWithReason:[NSString stringWithFormat:@"Chargement impossible : %@", error.localizedDescription]];
}
- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    [self webView:webView didFailProvisionalNavigation:navigation withError:error];
}
- (void)webView:(WKWebView *)webView decidePolicyForNavigationResponse:(WKNavigationResponse *)response decisionHandler:(void (^)(WKNavigationResponsePolicy))decisionHandler {
    NSHTTPURLResponse *http = [response.response isKindOfClass:NSHTTPURLResponse.class] ? (NSHTTPURLResponse *)response.response : nil;
    if (response.forMainFrame && http && http.statusCode >= 400) {
        decisionHandler(WKNavigationResponsePolicyCancel);
        [self stopWithReason:[NSString stringWithFormat:@"Le serveur du jeu répond HTTP %ld.", (long)http.statusCode]];
    } else decisionHandler(WKNavigationResponsePolicyAllow);
}
- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *url = action.request.URL;
    BOOL allowed = [url.scheme isEqualToString:@"https"] && [url.host isEqualToString:@"bo1.znoam.eu"] && [url.path hasPrefix:@"/bo1z/"];
    decisionHandler(allowed ? WKNavigationActionPolicyAllow : WKNavigationActionPolicyCancel);
}
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
    if (message.webView != self.webView || !message.frameInfo.mainFrame || ![message.frameInfo.securityOrigin.host isEqualToString:@"bo1.znoam.eu"] || ![message.body isKindOfClass:NSDictionary.class]) return;
    NSDictionary *body = message.body;
    if ([body[@"type"] isEqual:@"logs"] && [body[@"lines"] isKindOfClass:NSArray.class]) {
        NSArray *lines = body[@"lines"];
        for (id line in [lines subarrayWithRange:NSMakeRange(0, MIN(lines.count, 40))]) if ([line isKindOfClass:NSString.class]) [self appendLog:line];
        [self saveReport];
    } else if ([body[@"type"] isEqual:@"capabilities"]) {
        self.capabilities = [body.description substringToIndex:MIN(body.description.length, 1600)];
        [self appendLog:[NSString stringWithFormat:@"Capacités : %@", body]];
        [self saveReport];
        BOOL (^yes)(id) = ^BOOL(id value) { return [value isKindOfClass:NSNumber.class] && [value boolValue]; };
        if (!yes(body[@"jspi"])) [self stopWithReason:@"Cette version d’iOS ne fournit pas JSPI au moteur. iOS 27 ou une version compatible est nécessaire."];
        else if (!yes(body[@"isolated"]) || !yes(body[@"sharedMemory"])) [self stopWithReason:@"La mémoire partagée nécessaire au jeu n’est pas disponible dans cette vue web."];
    } else if ([body[@"type"] isEqual:@"memory"] || [body[@"type"] isEqual:@"memoryPatch"]) {
        NSData *json = [NSJSONSerialization dataWithJSONObject:body options:NSJSONWritingSortedKeys error:nil];
        NSString *text = json ? [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding] : @"invalide";
        if (text.length > 1800) text = [text substringToIndex:1800];
        if ([body[@"type"] isEqual:@"memoryPatch"]) {
            self.patchStatus = text;
            if ([body[@"state"] isEqual:@"failed"]) {
                [self stopWithReason:@"Le moteur téléchargé ne correspond pas au correctif mémoire de cette application."];
                return;
            }
        } else {
            [self.memorySamples addObject:[NSString stringWithFormat:@"%@: %@", NSDate.date.description, text]];
            while (self.memorySamples.count > 24) [self.memorySamples removeObjectAtIndex:0];
        }
        [self saveReport];
    }
}
- (void)didReceiveMemoryWarning {
    [super didReceiveMemoryWarning];
    [self appendLog:@"iOS a signalé une pression mémoire à l’application. Cela ne prouve pas la cause d’un arrêt du moteur web."];
    [self saveReport];
}
@end

@interface AppDelegate : UIResponder <UIApplicationDelegate>
@end
@interface SceneDelegate : UIResponder <UIWindowSceneDelegate>
@property(nonatomic, strong) UIWindow *window;
@end
@implementation AppDelegate
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
    return YES;
}
@end
@implementation SceneDelegate
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
    if (![scene isKindOfClass:UIWindowScene.class]) return;
    self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
    self.window.rootViewController = [GameController new];
    [self.window makeKeyAndVisible];
}
- (void)sceneWillResignActive:(UIScene *)scene { UIApplication.sharedApplication.idleTimerDisabled = NO; }
- (void)sceneDidBecomeActive:(UIScene *)scene {
    GameController *controller = (GameController *)self.window.rootViewController;
    UIApplication.sharedApplication.idleTimerDisabled = controller.webView != nil;
}
@end

int main(int argc, char *argv[]) {
    @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass(AppDelegate.class)); }
}
