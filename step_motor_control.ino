#include <AccelStepper.h>

#define IN1 13
#define IN2 12
#define IN3 14
#define IN4 27

#define MOTION_IN_PIN 25   // PIR (inside)
#define ULTRA_IN_PIN  26   // Ultrasonic (outside)
#define LED_PIN 15

int stepAmt = 1024;
long posInside  = 0;
long posOutside = stepAmt;

AccelStepper stepper(AccelStepper::FULL4WIRE, IN1, IN3, IN2, IN4);

// Track last commanded position
long currentTarget = 0;

unsigned long lastInactive = 0;
const unsigned long HOME_DELAY = 2000;

void setup() {
  Serial.begin(115200);

  pinMode(MOTION_IN_PIN, INPUT);
  pinMode(ULTRA_IN_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);

  stepper.setMaxSpeed(500);
  stepper.setAcceleration(100);
  stepper.setCurrentPosition(0);

  Serial.println("Stepper Control Ready");
}

void loop() {

  stepper.run();

  if (stepper.distanceToGo() != 0) {
    return;
  }

  int motion = digitalRead(MOTION_IN_PIN);
  int ultra  = digitalRead(ULTRA_IN_PIN);
  //int ultra = 1;

  long requestedTarget;

  if (ultra == 1) {                     // Outside
    requestedTarget = posOutside;
    digitalWrite(LED_PIN, HIGH);
    lastInactive = 0;
  }
  else if (motion == 1) {               // Inside
    requestedTarget = posInside;
    digitalWrite(LED_PIN, HIGH);
    lastInactive = 0;
  }
  else {                                // None == Home (inside)
    if (lastInactive == 0) lastInactive = millis();

    if (millis() - lastInactive >= HOME_DELAY) {
      requestedTarget = posInside;    // confirm home after delay
    }
    else {
      //still waiting = don't change target yet
      requestedTarget = stepper.targetPosition();
      digitalWrite(LED_PIN, LOW);
    }
  }

  if (requestedTarget != currentTarget) {
    currentTarget = requestedTarget;
    stepper.moveTo(currentTarget);

    Serial.print("Moving to ");
    Serial.println(currentTarget == posOutside ? "OUTSIDE" : "INSIDE");
  }
}
