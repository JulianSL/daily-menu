// swift-tools-version: 5.9

// App package for Xcode (macOS) or Swift Playgrounds (iPad / Mac).
// Open the MenuMingguan.swiftpm folder directly — no .xcodeproj needed.

import PackageDescription
import AppleProductTypes

let package = Package(
    name: "Menu Mingguan",
    platforms: [
        .iOS("17.0")
    ],
    products: [
        .iOSApplication(
            name: "Menu Mingguan",
            targets: ["AppModule"],
            bundleIdentifier: "com.julian.menumingguan",
            teamIdentifier: "",
            displayVersion: "1.0",
            bundleVersion: "1",
            appIcon: .placeholder(icon: .calendar),
            accentColor: .presetColor(.green),
            supportedDeviceFamilies: [
                .pad,
                .phone
            ],
            supportedInterfaceOrientations: [
                .portrait,
                .landscapeRight,
                .landscapeLeft,
                .portraitUpsideDown(.when(deviceFamilies: [.pad]))
            ]
        )
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            path: ".",
            resources: [
                .process("Resources")
            ]
        )
    ]
)
