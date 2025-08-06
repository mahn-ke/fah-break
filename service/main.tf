terraform {
  backend "pg" {
  }
  required_providers {
    allinkl = {
      source  = "ViMaSter/allinkl"
      version = "0.1.2"
    }
    keycloak = {
      source  = "mrparkers/keycloak"
      version = "4.4.0"
    }
  }
}

provider "allinkl" {
  kas_auth_type = "plain"
}

provider "keycloak" {
  url = "https://sso.by.vincent.mahn.ke"
}

data "keycloak_realm" "sso_by_vincent_mahn_ke" {
  realm = "sso.by.vincent.mahn.ke"
}